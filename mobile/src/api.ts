// Same contract as the browser and Stash Desktop: this phone is a linked device
// with a token, and sends each file in encrypted pieces under a server-issued
// upload id. Signing in is Google on the website, in a browser sheet; the link
// code is machinery the person never sees.

import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";
import { encryptChunk, CHUNK_PLAIN_BYTES, toB64, type Key } from "./crypto";

export const DEFAULT_SERVER = "https://stash.olusanyatodd.com";

export type Settings = { wifiOnly: boolean; chargingOnly: boolean; videos: boolean };
export const DEFAULT_SETTINGS: Settings = { wifiOnly: true, chargingOnly: true, videos: true };

export type Config = {
  server: string;
  token?: string;
  deviceId?: string;
  email?: string | null;
  key?: string;
  settings?: Settings;
  setup?: { seenCarousel?: boolean; moved?: boolean; backup?: boolean | "later" };
  lastRun?: { at: number; total: number; done: number; pending: number; failed: number };
  pendingLink?: { linkId: string; secret: string; code: string; url: string; expiresAt: number };
};

export async function loadConfig(): Promise<Config> {
  const raw = await SecureStore.getItemAsync("stash_config");
  return raw ? JSON.parse(raw) : { server: DEFAULT_SERVER };
}

export async function saveConfig(c: Config) {
  await SecureStore.setItemAsync("stash_config", JSON.stringify(c));
}

export const settingsOf = (c: Config): Settings => ({ ...DEFAULT_SETTINGS, ...(c.settings ?? {}) });

const auth = (c: Config) => ({ authorization: `Bearer ${c.token}` });

// --- Sign-in

// Native Google sign-in: the account picker on the phone gives the app an identity token;
// the server verifies it with Google and links this phone in the same step.
export async function signInWithGoogle(server: string, idToken: string, name: string) {
  const r = await fetch(`${server}/api/auth/google/device`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken, name, platform: "phone" }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error(j.error ?? `Sign-in failed (${r.status})`);
  return j as { token: string; deviceId: string; email: string | null; protection: "standard" | "passcode" | null };
}

// How the files are protected: Standard (Stash keeps the key) or Locked (a passcode only the person knows).
// The first decision, and later switches: going back to Standard sends the plain key (the phone has it once the passcode opened the files).
export async function setProtection(c: Config, body: { mode: "standard"; key?: string } | { mode: "passcode"; keyWrapped: { salt: string; iv: string; ct: string; iter: number; hint?: string } }) {
  const r = await fetch(`${c.server}/api/account/protection`, { method: "POST", headers: { ...auth(c), "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save that choice.");
}

// --- Linking

export async function startLink(server: string, name: string) {
  const r = await fetch(`${server}/api/devices/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, platform: "phone", kind: "phone" }) });
  if (!r.ok) throw new Error(`Couldn't reach Stash (${r.status})`);
  return (await r.json()) as { code: string; linkId: string; secret: string; url: string; expiresInSeconds: number };
}

export async function pollLink(server: string, linkId: string, secret: string) {
  const r = await fetch(`${server}/api/devices/link?id=${encodeURIComponent(linkId)}&secret=${encodeURIComponent(secret)}`);
  return (await r.json()) as { state: "waiting" | "approved" | "expired" | "gone"; token?: string; deviceId?: string; email?: string | null };
}

// Continue with Google: open the website's sign-in in a browser sheet that lands on the
// approval page for this phone; the page sends the sheet back here (stash://linked).
// Returns when the sheet closes; the caller then collects the result by polling.
export async function signInSheet(server: string, link: { code: string }) {
  const next = `/devices/link?code=${encodeURIComponent(link.code)}&from=app`;
  const url = `${server}/signin?next=${encodeURIComponent(next)}`;
  return WebBrowser.openAuthSessionAsync(url, "stash://linked", { showInRecents: true });
}

export async function me(c: Config) {
  const r = await fetch(`${c.server}/api/me`, { headers: auth(c) });
  const j = await r.json();
  if (!r.ok || !j.signedIn) throw new Error("unlinked");
  return j as { email?: string | null; key?: string | null; keyWrapped?: { salt: string; iv: string; ct: string; iter: number; hint?: string } | null; protection?: string | null; fileCount?: number; bytes?: number; googleConnected?: boolean; maxBytes?: number };
}

// The drive, as the website lists it (public fields only).
export type FileRow = { id: string; name: string; size: number; mime: string; folder: string; source: string; createdAt: number; modifiedAt?: number | null; thumb?: boolean; stored?: boolean; encrypted?: boolean; chunked?: boolean; shared?: boolean; deviceId?: string | null };
export async function listFiles(c: Config): Promise<FileRow[]> {
  const r = await fetch(`${c.server}/api/files`, { headers: auth(c) });
  if (!r.ok) throw new Error(`files (${r.status})`);
  return (await r.json()).files ?? [];
}

// --- The drive's other routes, the same ones the website calls (loft/src/app/api/**).

const json = (c: Config) => ({ ...auth(c), "content-type": "application/json" });
async function ok(r: Response, what: string) {
  if (!r.ok) throw Object.assign(new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `${what} (${r.status})`), { status: r.status });
  return r;
}

// The catalogue revision: a few bytes, so the list is fetched only when something changed.
export async function filesRev(c: Config): Promise<number> {
  const r = await ok(await fetch(`${c.server}/api/files/rev`, { headers: auth(c) }), "rev");
  return Number((await r.json()).rev ?? 0);
}

// Empty folders someone made, remembered until a file lands in them.
export async function listFolders(c: Config): Promise<string[]> {
  const r = await fetch(`${c.server}/api/folders`, { headers: auth(c) });
  if (!r.ok) return [];
  return (await r.json()).folders ?? [];
}
export async function createFolder(c: Config, path: string): Promise<string> {
  const r = await ok(await fetch(`${c.server}/api/folders`, { method: "POST", headers: json(c), body: JSON.stringify({ path }) }), "folder");
  return (await r.json()).path ?? path;
}
export async function forgetFolder(c: Config, path: string) {
  await ok(await fetch(`${c.server}/api/folders`, { method: "DELETE", headers: json(c), body: JSON.stringify({ path }) }), "folder");
}

export async function renameFile(c: Config, id: string, name: string) {
  await ok(await fetch(`${c.server}/api/files/${id}`, { method: "PATCH", headers: json(c), body: JSON.stringify({ name }) }), "rename");
}
export async function moveFiles(c: Config, ids: string[], folder: string) {
  await ok(await fetch(`${c.server}/api/files`, { method: "PATCH", headers: json(c), body: JSON.stringify({ ids, folder }) }), "move");
}
export async function trashFile(c: Config, id: string) {
  await ok(await fetch(`${c.server}/api/files/${id}`, { method: "DELETE", headers: auth(c) }), "trash");
}

// A public link for one file (Standard accounts only).
export async function createLink(c: Config, id: string): Promise<string> {
  const r = await ok(await fetch(`${c.server}/api/files/${id}/share`, { method: "POST", headers: auth(c) }), "link");
  return (await r.json()).url;
}
export async function removeLink(c: Config, id: string) {
  await ok(await fetch(`${c.server}/api/files/${id}/share`, { method: "DELETE", headers: auth(c) }), "link");
}

// Ciphertext straight to a local file: the file itself, or its stored preview.
export async function downloadTo(c: Config, id: string, path: string, what: "download" | "thumb" = "download") {
  const d = await FileSystem.downloadAsync(`${c.server}/api/files/${id}/${what}`, path, { headers: auth(c) });
  if (d.status !== 200) {
    FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
    throw new Error(`${what} (${d.status})`);
  }
}

// This phone unlinks itself; what it already sent stays in the account.
export async function unlinkSelf(c: Config) {
  await fetch(`${c.server}/api/devices/me`, { method: "DELETE", headers: auth(c) }).catch(() => {});
}

export async function report(c: Config, state: object) {
  await fetch(`${c.server}/api/devices/me`, { method: "POST", headers: { ...auth(c), "content-type": "application/json" }, body: JSON.stringify(state) }).catch(() => {});
}

// --- Uploads

// Each encrypted piece is written to a temp file and streamed by the native multipart
// uploader: FormData with data URIs does not work for multi-megabyte parts on Android.
async function postFile(c: Config, path: string, field: string, bytes: Uint8Array, params: Record<string, string>, method: "POST" | "PUT" = "POST") {
  const tmp = `${FileSystem.cacheDirectory}up-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`;
  await FileSystem.writeAsStringAsync(tmp, toB64(bytes), { encoding: FileSystem.EncodingType.Base64 });
  try {
    const r = await FileSystem.uploadAsync(`${c.server}${path}`, tmp, {
      httpMethod: method,
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: field,
      mimeType: "application/octet-stream",
      parameters: params,
      headers: auth(c),
    });
    return { ok: r.status >= 200 && r.status < 300, status: r.status, body: r.body };
  } finally {
    FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
  }
}

export async function uploadBytes(c: Config, key: Key, bytes: Uint8Array, meta: { name: string; mime: string; folder: string; modifiedAt?: number }, thumb?: Uint8Array, source: "phone" | "google-drive" = "phone", onProgress?: (fraction: number) => void) {
  const fields: Record<string, string> = { name: meta.name, mime: meta.mime, folder: meta.folder, source, size: String(bytes.length), encrypted: "1", ...(meta.modifiedAt ? { modifiedAt: String(meta.modifiedAt) } : {}) };
  if (bytes.length <= CHUNK_PLAIN_BYTES) {
    // One request for the file; the preview, if any, is attached right after.
    const r = await postFile(c, "/api/files", "file", await encryptChunk(key, bytes), fields);
    if (!r.ok) throw new Error(`upload failed (${r.status}) ${r.body.slice(0, 120)}`);
    const file = JSON.parse(r.body).file;
    if (thumb && file?.id) await postFile(c, `/api/files/${file.id}/thumb`, "thumb", await encryptChunk(key, thumb), {}, "PUT").catch(() => {});
    return file;
  }
  // The server issues the upload id, records each piece under it, and assembles them at registration.
  const ur = await fetch(`${c.server}/api/uploads`, { method: "POST", headers: { ...auth(c), "content-type": "application/json" }, body: JSON.stringify({ name: meta.name }) });
  if (!ur.ok) throw new Error(`upload start failed (${ur.status})`);
  const upload: string = (await ur.json()).upload;
  for (let i = 0, off = 0; off < bytes.length; i++, off += CHUNK_PLAIN_BYTES) {
    const r = await postFile(c, "/api/files/part", "piece", await encryptChunk(key, bytes.subarray(off, off + CHUNK_PLAIN_BYTES)), { upload, index: String(i) });
    if (!r.ok) throw new Error(`piece ${i} failed (${r.status}) ${r.body.slice(0, 120)}`);
    onProgress?.(Math.min(0.98, (off + CHUNK_PLAIN_BYTES) / bytes.length));
  }
  if (thumb) await postFile(c, "/api/files/part", "piece", await encryptChunk(key, thumb), { upload, index: "thumb" }).catch(() => {});
  const r = await fetch(`${c.server}/api/files`, { method: "POST", headers: { ...auth(c), "content-type": "application/json" }, body: JSON.stringify({ ...fields, upload }) });
  if (!r.ok) throw new Error(`register failed (${r.status})`);
  return (await r.json()).file;
}

// --- Devices and Settings: the same routes the website's Devices and Settings pages call.

export type DeviceFolder = { path: string; label: string; files: number; bytes: number; pending: number; failed: number; lastUpload?: number };
export type DeviceRow = {
  id: string;
  name: string;
  platform: string;
  kind: "desktop" | "phone";
  createdAt: number;
  lastSeen: number;
  files: number;
  bytes: number;
  state: { status: "idle" | "scanning" | "uploading" | "paused" | "error"; detail?: string; folders: DeviceFolder[]; version?: string; updatedAt: number } | null;
};

// GET /api/devices: every linked device, with what it has sent so far.
export async function listDevices(c: Config): Promise<{ devices: DeviceRow[]; phoneFiles: number }> {
  const r = await ok(await fetch(`${c.server}/api/devices`, { headers: auth(c) }), "devices");
  const j = await r.json();
  return { devices: j.devices ?? [], phoneFiles: Number(j.phoneFiles ?? 0) };
}
// PATCH /api/devices/{id}
export async function renameDevice(c: Config, id: string, name: string) {
  await ok(await fetch(`${c.server}/api/devices/${id}`, { method: "PATCH", headers: json(c), body: JSON.stringify({ name }) }), "rename");
}
// DELETE /api/devices/{id}: that device stops backing up at once; what it sent stays.
export async function unlinkDevice(c: Config, id: string) {
  await ok(await fetch(`${c.server}/api/devices/${id}`, { method: "DELETE", headers: auth(c) }), "unlink");
}

// GET /api/me, with the fields Settings shows (the account line, protection, imports).
export type Account = {
  email: string | null;
  name: string | null;
  picture: string | null;
  protection: "standard" | "passcode" | null;
  keyWrapped: { salt: string; iv: string; ct: string; iter: number; hint?: string } | null;
  fileCount: number;
  bytes: number;
  googleConnected: boolean;
};
export async function account(c: Config): Promise<Account> {
  const r = await fetch(`${c.server}/api/me`, { headers: auth(c) });
  const j = await r.json();
  if (!r.ok || !j.signedIn) throw Object.assign(new Error("unlinked"), { status: 401 });
  return { email: j.email ?? null, name: j.name ?? null, picture: j.picture ?? null, protection: j.protection ?? null, keyWrapped: j.keyWrapped ?? null, fileCount: Number(j.fileCount ?? 0), bytes: Number(j.bytes ?? 0), googleConnected: !!j.googleConnected };
}

// POST /api/auth/signout?all=1: ends every browser session of the account; linked devices
// keep theirs. Returns how many ended, or null when the server would not do it for a
// linked device (it then answers ok without a count).
export async function signOutEverywhere(c: Config): Promise<number | null> {
  const r = await ok(await fetch(`${c.server}/api/auth/signout?all=1`, { method: "POST", headers: auth(c) }), "sign out");
  const j = await r.json().catch(() => ({}));
  return typeof j.ended === "number" ? j.ended : null;
}

// DELETE /api/google: forget the Google Drive connection; nothing already moved is touched.
export async function disconnectGoogle(c: Config) {
  await ok(await fetch(`${c.server}/api/google`, { method: "DELETE", headers: auth(c) }), "disconnect");
}

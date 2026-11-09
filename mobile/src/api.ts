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

// The account's first decision, made in the app: Standard (Stash keeps the key) or Locked (a passcode only the person knows).
export async function setProtection(c: Config, body: { mode: "standard" } | { mode: "passcode"; keyWrapped: { salt: string; iv: string; ct: string; iter: number; hint?: string } }) {
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
  return j as { email?: string | null; key?: string | null; keyWrapped?: { salt: string; iv: string; ct: string; iter: number; hint?: string } | null; protection?: string | null; fileCount?: number; bytes?: number; googleConnected?: boolean };
}

// The drive, as the website lists it (public fields only).
export type FileRow = { id: string; name: string; size: number; mime: string; folder: string; source: string; createdAt: number; modifiedAt?: number | null; thumb?: boolean; stored?: boolean };
export async function listFiles(c: Config): Promise<FileRow[]> {
  const r = await fetch(`${c.server}/api/files`, { headers: auth(c) });
  if (!r.ok) throw new Error(`files (${r.status})`);
  return (await r.json()).files ?? [];
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

export async function uploadBytes(c: Config, key: Key, bytes: Uint8Array, meta: { name: string; mime: string; folder: string; modifiedAt?: number }, thumb?: Uint8Array, source: "phone" | "google-drive" = "phone") {
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
  }
  if (thumb) await postFile(c, "/api/files/part", "piece", await encryptChunk(key, thumb), { upload, index: "thumb" }).catch(() => {});
  const r = await fetch(`${c.server}/api/files`, { method: "POST", headers: { ...auth(c), "content-type": "application/json" }, body: JSON.stringify({ ...fields, upload }) });
  if (!r.ok) throw new Error(`register failed (${r.status})`);
  return (await r.json()).file;
}

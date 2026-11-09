// Same contract as the browser and Stash Desktop: link with a code, then send
// each file in encrypted pieces with a device token.

import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { encryptChunk, CHUNK_PLAIN_BYTES, type Key } from "./crypto";

export const DEFAULT_SERVER = "https://stash.olusanyatodd.com";

export type Config = { server: string; token?: string; deviceId?: string; email?: string | null; key?: string; pendingLink?: { linkId: string; secret: string; code: string; url: string; expiresAt: number } };

export async function loadConfig(): Promise<Config> {
  const raw = await SecureStore.getItemAsync("stash_config");
  return raw ? JSON.parse(raw) : { server: DEFAULT_SERVER };
}

export async function saveConfig(c: Config) {
  await SecureStore.setItemAsync("stash_config", JSON.stringify(c));
}

export async function startLink(server: string, name: string) {
  const r = await fetch(`${server}/api/devices/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, platform: "phone", kind: "phone" }) });
  if (!r.ok) throw new Error(`Couldn't reach Stash (${r.status})`);
  return (await r.json()) as { code: string; linkId: string; secret: string; url: string; expiresInSeconds: number };
}

export async function pollLink(server: string, linkId: string, secret: string) {
  const r = await fetch(`${server}/api/devices/link?id=${encodeURIComponent(linkId)}&secret=${encodeURIComponent(secret)}`);
  return (await r.json()) as { state: "waiting" | "approved" | "expired" | "gone"; token?: string; deviceId?: string; email?: string | null };
}

const auth = (c: Config) => ({ authorization: `Bearer ${c.token}` });

export async function me(c: Config) {
  const r = await fetch(`${c.server}/api/me`, { headers: auth(c) });
  const j = await r.json();
  if (!r.ok || !j.signedIn) throw new Error("unlinked");
  return j as { key?: string | null; keyWrapped?: { salt: string; iv: string; ct: string; iter: number; hint?: string } | null; protection?: string };
}

// This phone unlinks itself; what it already sent stays in the account.
export async function unlinkSelf(c: Config) {
  await fetch(`${c.server}/api/devices/me`, { method: "DELETE", headers: auth(c) }).catch(() => {});
}

export async function report(c: Config, state: object) {
  await fetch(`${c.server}/api/devices/me`, { method: "POST", headers: { ...auth(c), "content-type": "application/json" }, body: JSON.stringify(state) }).catch(() => {});
}

// Upload one file's bytes (already read into memory) in pieces. Each encrypted piece is
// written to a temp file and streamed by the native multipart uploader: FormData with
// data URIs does not work for multi-megabyte parts on Android.
async function postFile(c: Config, path: string, field: string, bytes: Uint8Array, filename: string, params: Record<string, string>, method: "POST" | "PUT" = "POST") {
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

export async function uploadBytes(c: Config, key: Key, bytes: Uint8Array, meta: { name: string; mime: string; folder: string; modifiedAt?: number }, thumb?: Uint8Array) {
  const fields: Record<string, string> = { name: meta.name, mime: meta.mime, folder: meta.folder, source: "phone", size: String(bytes.length), encrypted: "1", ...(meta.modifiedAt ? { modifiedAt: String(meta.modifiedAt) } : {}) };
  if (bytes.length <= CHUNK_PLAIN_BYTES) {
    // One request for the file; the preview, if any, is attached right after.
    const r = await postFile(c, "/api/files", "file", await encryptChunk(key, bytes), `${meta.name}.stash`, fields);
    if (!r.ok) throw new Error(`upload failed (${r.status}) ${r.body.slice(0, 120)}`);
    const file = JSON.parse(r.body).file;
    if (thumb && file?.id) {
      await postFile(c, `/api/files/${file.id}/thumb`, "thumb", await encryptChunk(key, thumb), "thumb.stash", {}, "PUT").catch(() => {});
    }
    return file;
  }
  // The server issues the upload id, records each piece under it, and assembles them at registration.
  const ur = await fetch(`${c.server}/api/uploads`, { method: "POST", headers: { ...auth(c), "content-type": "application/json" }, body: JSON.stringify({ name: meta.name }) });
  if (!ur.ok) throw new Error(`upload start failed (${ur.status})`);
  const upload: string = (await ur.json()).upload;
  for (let i = 0, off = 0; off < bytes.length; i++, off += CHUNK_PLAIN_BYTES) {
    const r = await postFile(c, "/api/files/part", "piece", await encryptChunk(key, bytes.subarray(off, off + CHUNK_PLAIN_BYTES)), `${meta.name}.part${i}.stash`, { upload, index: String(i) });
    if (!r.ok) throw new Error(`piece ${i} failed (${r.status}) ${r.body.slice(0, 120)}`);
  }
  if (thumb) await postFile(c, "/api/files/part", "piece", await encryptChunk(key, thumb), "thumb.stash", { upload, index: "thumb" }).catch(() => {});
  const r = await fetch(`${c.server}/api/files`, { method: "POST", headers: { ...auth(c), "content-type": "application/json" }, body: JSON.stringify({ ...fields, upload }) });
  if (!r.ok) throw new Error(`register failed (${r.status})`);
  return (await r.json()).file;
}

function toB64(b: Uint8Array) {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return globalThis.btoa(s);
}

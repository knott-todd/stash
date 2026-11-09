// Same contract as the browser and Stash Desktop: link with a code, then send
// each file in encrypted pieces with a device token.

import * as SecureStore from "expo-secure-store";
import { encryptChunk, CHUNK_PLAIN_BYTES } from "./crypto";

export const DEFAULT_SERVER = "https://stash.olusanyatodd.com";

export type Config = { server: string; token?: string; deviceId?: string; email?: string | null; key?: string };

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

export async function report(c: Config, state: object) {
  await fetch(`${c.server}/api/devices/me`, { method: "POST", headers: { ...auth(c), "content-type": "application/json" }, body: JSON.stringify(state) }).catch(() => {});
}

// Upload one file's bytes (already read into memory) in pieces.
export async function uploadBytes(c: Config, key: CryptoKey, bytes: Uint8Array, meta: { name: string; mime: string; folder: string; modifiedAt?: number }, thumb?: Uint8Array) {
  const fields: Record<string, string> = { name: meta.name, mime: meta.mime, folder: meta.folder, source: "phone", size: String(bytes.length), encrypted: "1", ...(meta.modifiedAt ? { modifiedAt: String(meta.modifiedAt) } : {}) };
  if (bytes.length <= CHUNK_PLAIN_BYTES) {
    const fd = new FormData();
    fd.append("file", { uri: `data:application/octet-stream;base64,${toB64(await encryptChunk(key, bytes))}`, name: `${meta.name}.stash`, type: "application/octet-stream" } as unknown as Blob);
    if (thumb) fd.append("thumb", { uri: `data:application/octet-stream;base64,${toB64(await encryptChunk(key, thumb))}`, name: "thumb.stash", type: "application/octet-stream" } as unknown as Blob);
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    const r = await fetch(`${c.server}/api/files`, { method: "POST", headers: auth(c), body: fd });
    if (!r.ok) throw new Error(`upload failed (${r.status})`);
    return (await r.json()).file;
  }
  // The server issues the upload id, records each piece under it, and assembles them at registration.
  const ur = await fetch(`${c.server}/api/uploads`, { method: "POST", headers: { ...auth(c), "content-type": "application/json" }, body: JSON.stringify({ name: meta.name }) });
  if (!ur.ok) throw new Error(`upload start failed (${ur.status})`);
  const upload: string = (await ur.json()).upload;
  for (let i = 0, off = 0; off < bytes.length; i++, off += CHUNK_PLAIN_BYTES) {
    const fd = new FormData();
    fd.append("piece", { uri: `data:application/octet-stream;base64,${toB64(await encryptChunk(key, bytes.subarray(off, off + CHUNK_PLAIN_BYTES)))}`, name: `${meta.name}.part${i}.stash`, type: "application/octet-stream" } as unknown as Blob);
    fd.append("upload", upload);
    fd.append("index", String(i));
    const r = await fetch(`${c.server}/api/files/part`, { method: "POST", headers: auth(c), body: fd });
    if (!r.ok) throw new Error(`piece ${i} failed (${r.status})`);
  }
  if (thumb) {
    const fd = new FormData();
    fd.append("piece", { uri: `data:application/octet-stream;base64,${toB64(await encryptChunk(key, thumb))}`, name: "thumb.stash", type: "application/octet-stream" } as unknown as Blob);
    fd.append("upload", upload);
    fd.append("index", "thumb");
    await fetch(`${c.server}/api/files/part`, { method: "POST", headers: auth(c), body: fd });
  }
  const r = await fetch(`${c.server}/api/files`, { method: "POST", headers: { ...auth(c), "content-type": "application/json" }, body: JSON.stringify({ ...fields, upload }) });
  if (!r.ok) throw new Error(`register failed (${r.status})`);
  return (await r.json()).file;
}

function toB64(b: Uint8Array) {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return globalThis.btoa(s);
}

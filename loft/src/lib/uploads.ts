import { randomBytes } from "node:crypto";
import { store, type StoredPart, CHUNK_CIPHER_BYTES } from "./store";
import { deleteObjects } from "./telegram";

// Uploads in pieces are tracked on the server. The server hands out an upload id,
// records every piece it stores under that id with the owner, and assembles the
// piece list itself at registration. Clients never supply storage pointers
// (threat T-1), can ask which pieces already arrived and resume (R-1), and
// anything never registered is swept after a day.

export type Upload = { uid: string; name: string; createdAt: number };
export const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

const kUp = (id: string) => `upload:${id}`;
const kPart = (id: string, index: number | "thumb") => `upload:${id}:p${index}`;
const ID = /^[A-Za-z0-9_-]{16,32}$/;

export async function startUpload(uid: string, name: string) {
  const id = randomBytes(15).toString("base64url");
  await store().kvSet(kUp(id), { uid, name: name.slice(0, 255), createdAt: Date.now() } satisfies Upload);
  return id;
}

// The ledger header, only if it belongs to this account.
export async function getUpload(uid: string, id: string) {
  if (!ID.test(id)) return null;
  const u = await store().kvGet<Upload>(kUp(id));
  return u && u.uid === uid ? u : null;
}

export async function recordPart(uid: string, id: string, index: number | "thumb", part: StoredPart) {
  if (!(await getUpload(uid, id))) return false;
  await store().kvSet(kPart(id, index), part);
  return true;
}

// Which pieces have arrived, by index; the thumbnail is "thumb".
export async function partsOf(uid: string, id: string) {
  if (!(await getUpload(uid, id))) return null;
  const rows = await store().kvList(`${kUp(id)}:p`);
  const parts = new Map<number, StoredPart>();
  let thumb: StoredPart | undefined;
  for (const r of rows) {
    const idx = r.key.slice(`${kUp(id)}:p`.length);
    if (idx === "thumb") thumb = r.value as StoredPart;
    else if (/^\d+$/.test(idx)) parts.set(Number(idx), r.value as StoredPart);
  }
  return { parts, thumb };
}

// The ordered piece list for registration, or a reason it cannot be registered yet.
export async function assemble(uid: string, id: string): Promise<{ parts: StoredPart[]; thumb?: StoredPart } | { error: string; missing?: number[] }> {
  const got = await partsOf(uid, id);
  if (!got) return { error: "unknown upload" };
  const n = got.parts.size ? Math.max(...got.parts.keys()) + 1 : 0;
  if (!n) return { error: "no pieces" };
  const missing: number[] = [];
  for (let i = 0; i < n; i++) if (!got.parts.has(i)) missing.push(i);
  if (missing.length) return { error: "pieces missing", missing };
  const parts = Array.from({ length: n }, (_, i) => got.parts.get(i)!);
  // Every piece but the last must be the standard size, or no reader can split the stream.
  if (parts.slice(0, -1).some((p) => p.size !== CHUNK_CIPHER_BYTES)) return { error: "pieces must be the standard size" };
  return { parts, ...(got.thumb ? { thumb: got.thumb } : {}) };
}

// Forget the ledger once the file is registered (the file row now owns the pointers).
export async function finishUpload(id: string) {
  const db = store();
  const rows = await db.kvList(`${kUp(id)}:p`);
  await Promise.all([...rows.map((r) => db.kvDelete(r.key)), db.kvDelete(kUp(id))]);
}

// Uploads started more than a day ago and never registered: delete their pieces and forget them.
export async function sweepUploads(now = Date.now()) {
  const db = store();
  const heads = await db.kvList("upload:");
  let swept = 0;
  for (const h of heads) {
    if (h.key.includes(":p")) continue;
    const u = h.value as Upload;
    if (now - u.createdAt < UPLOAD_TTL_MS) continue;
    const id = h.key.slice("upload:".length);
    const pieces = await db.kvList(`${kUp(id)}:p`);
    await deleteObjects({ parts: pieces.map((p) => p.value as StoredPart) }).catch(() => {});
    await finishUpload(id);
    swept++;
  }
  return swept;
}

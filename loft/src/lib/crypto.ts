"use client";

// Client-side encryption. Files are AES-GCM encrypted in the browser before
// upload and decrypted after download, so storage only ever holds ciphertext.
// The key belongs to the account: the server hands it to this browser after a
// sign-in, and signing out removes it from here again.
//
// Large files are encrypted in fixed-size pieces (CHUNK_PLAIN_BYTES each), each
// piece its own IV + ciphertext + tag, so the reader can split the stream by
// size alone. A one-piece file is the same shape with a single piece.

import { CHUNK_CIPHER_BYTES, CHUNK_PLAIN_BYTES } from "./files-limits";

const KEY_STORE = "stash_key_v1";

function unb64url(s: string) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export function getRawKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORE);
  } catch {
    return null;
  }
}

export function setRawKey(raw: string) {
  try {
    localStorage.setItem(KEY_STORE, raw);
  } catch {}
}

export function clearRawKey() {
  try {
    localStorage.removeItem(KEY_STORE);
  } catch {}
}

let cached: { raw: string; key: CryptoKey } | null = null;
async function key() {
  const raw = getRawKey();
  if (!raw) throw new Error("no-key");
  if (cached?.raw !== raw) cached = { raw, key: await crypto.subtle.importKey("raw", unb64url(raw), "AES-GCM", false, ["encrypt", "decrypt"]) };
  return cached.key;
}

export async function encryptBytes(plain: ArrayBuffer | Uint8Array): Promise<Blob> {
  const k = await key();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, plain as BufferSource);
  return new Blob([iv, ct], { type: "application/octet-stream" });
}

async function decryptOne(k: CryptoKey, block: ArrayBuffer) {
  const iv = new Uint8Array(block.slice(0, 12));
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, block.slice(12));
}

export async function decryptBytes(blob: ArrayBuffer): Promise<ArrayBuffer> {
  return decryptOne(await key(), blob);
}

// A file that was sent in pieces: every piece is CHUNK_CIPHER_BYTES long except the last.
export async function decryptChunked(blob: ArrayBuffer): Promise<ArrayBuffer> {
  const k = await key();
  const out: ArrayBuffer[] = [];
  for (let off = 0; off < blob.byteLength; off += CHUNK_CIPHER_BYTES) {
    out.push(await decryptOne(k, blob.slice(off, Math.min(off + CHUNK_CIPHER_BYTES, blob.byteLength))));
  }
  return new Blob(out).arrayBuffer();
}

export async function decryptFile(blob: ArrayBuffer, chunked: boolean) {
  return chunked ? decryptChunked(blob) : decryptBytes(blob);
}

export { CHUNK_PLAIN_BYTES, CHUNK_CIPHER_BYTES };

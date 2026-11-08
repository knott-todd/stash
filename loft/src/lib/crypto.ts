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

// ---- Passcode protection ("Locked"): the key wrapped with a passcode-derived key.
// Stash stores only the wrapped form and cannot open it.

export type WrappedKey = { salt: string; iv: string; ct: string; iter: number; hint?: string };
const PBKDF2_ITER = 600_000;

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function passcodeKey(passcode: string, salt: Uint8Array, iter: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function wrapKey(raw: string, passcode: string, hint?: string): Promise<WrappedKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await passcodeKey(passcode, salt, PBKDF2_ITER);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, unb64url(raw) as BufferSource);
  return { salt: b64url(salt), iv: b64url(iv), ct: b64url(new Uint8Array(ct)), iter: PBKDF2_ITER, ...(hint ? { hint } : {}) };
}

// null when the passcode is wrong.
export async function unwrapKey(w: WrappedKey, passcode: string): Promise<string | null> {
  try {
    const k = await passcodeKey(passcode, unb64url(w.salt), w.iter);
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64url(w.iv) as BufferSource }, k, unb64url(w.ct) as BufferSource);
    return b64url(new Uint8Array(raw));
  } catch {
    return null;
  }
}

// ---- Recovery code: the key itself, written so a person can copy it down.
// Crockford base32: no I, L, O or U, so it survives handwriting and reading aloud.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function recoveryCode(raw: string) {
  const bytes = unb64url(raw);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) out += CROCKFORD[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return out.match(/.{1,5}/g)!.join("-");
}

export function keyFromRecoveryCode(code: string): string | null {
  const fixed = code.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (fixed.length !== 26) return null;
  let bits = "";
  for (const ch of fixed) {
    const i = CROCKFORD.indexOf(ch);
    if (i < 0) return null;
    bits += i.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return b64url(bytes);
}

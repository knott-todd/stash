// AES-GCM with the account key, same shape as everywhere else: 12-byte IV +
// ciphertext + 16-byte tag per piece; plain pieces of 4,000,000 bytes.
// On Android the work is done natively (modules/stash-crypto), off the UI thread.
// The noble libraries (audited pure JavaScript) are the fallback where the native
// module is missing; they are far too slow for PBKDF2 at 600k rounds on a phone,
// so that fallback is only for development.

import { gcm } from "@noble/ciphers/aes";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import { getRandomBytes } from "expo-crypto";
import { StashCrypto } from "../modules/stash-crypto";

export const CHUNK_PLAIN_BYTES = 4_000_000;

export function toB64(b: Uint8Array) {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return globalThis.btoa(s);
}
export function fromB64(s: string) {
  return Uint8Array.from(globalThis.atob(s), (c) => c.charCodeAt(0));
}
const unb64url = (s: string) => fromB64(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
const b64url = (b: Uint8Array) => toB64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export type Key = Uint8Array; // raw AES key bytes (16 for accounts)

export async function importKey(raw: string): Promise<Key> {
  const k = unb64url(raw);
  // Accounts use AES-128 keys (16 bytes); accept any AES size.
  if (![16, 24, 32].includes(k.length)) throw new Error(`bad key (${k.length} bytes)`);
  return k;
}

export async function encryptChunk(key: Key, plain: Uint8Array) {
  if (StashCrypto) return fromB64(await StashCrypto.gcmEncrypt(toB64(key), toB64(plain)));
  const iv = getRandomBytes(12);
  const ct = gcm(key, iv).encrypt(plain); // ciphertext followed by the 16-byte tag
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

// Locking: wrap the account key with a passcode. Same shape as the web (PBKDF2-SHA256, 600k rounds → AES-GCM).
export const PBKDF2_ITER = 600_000;
export async function wrapKey(raw: string, passcode: string, hint?: string) {
  const pass = passcode.normalize("NFKC");
  const salt = getRandomBytes(16);
  const keyBytes = unb64url(raw);
  if (StashCrypto) {
    const k = await StashCrypto.pbkdf2(pass, toB64(salt), PBKDF2_ITER);
    const sealed = fromB64(await StashCrypto.gcmEncrypt(k, toB64(keyBytes))); // iv || ct || tag
    return { salt: b64url(salt), iv: b64url(sealed.subarray(0, 12)), ct: b64url(sealed.subarray(12)), iter: PBKDF2_ITER, ...(hint ? { hint } : {}) };
  }
  const k = pbkdf2(sha256, new TextEncoder().encode(pass), salt, { c: PBKDF2_ITER, dkLen: 32 });
  const iv = getRandomBytes(12);
  const ct = gcm(k, iv).encrypt(keyBytes);
  return { salt: b64url(salt), iv: b64url(iv), ct: b64url(ct), iter: PBKDF2_ITER, ...(hint ? { hint } : {}) };
}

// Recovery code: the key itself in Crockford base32, same as the web, so a person can write it down.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function recoveryCode(raw: string) {
  const bytes = unb64url(raw);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) out += CROCKFORD[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return out.match(/.{1,5}/g)!.join("-");
}

// Locked accounts: unwrap the key with the passcode (PBKDF2-SHA256 → AES-GCM).
export async function unwrapKey(w: { salt: string; iv: string; ct: string; iter: number }, passcode: string) {
  const pass = passcode.normalize("NFKC");
  try {
    if (StashCrypto) {
      const k = await StashCrypto.pbkdf2(pass, toB64(unb64url(w.salt)), w.iter);
      const raw = fromB64(await StashCrypto.gcmDecrypt(k, toB64(unb64url(w.iv)), toB64(unb64url(w.ct))));
      return b64url(raw);
    }
    const k = pbkdf2(sha256, new TextEncoder().encode(pass), unb64url(w.salt), { c: w.iter, dkLen: 32 });
    const raw = gcm(k, unb64url(w.iv)).decrypt(unb64url(w.ct));
    return b64url(raw);
  } catch {
    return null;
  }
}

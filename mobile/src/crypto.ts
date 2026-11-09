// AES-GCM with the account key, same shape as everywhere else: 12-byte IV +
// ciphertext + 16-byte tag per piece; plain pieces of 4,000,000 bytes.
// React Native has no WebCrypto. The noble libraries are audited pure
// JavaScript, so there is no native module to build; randomness comes from the OS
// through expo-crypto.

import { gcm } from "@noble/ciphers/aes";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import { getRandomBytes } from "expo-crypto";

export const CHUNK_PLAIN_BYTES = 4_000_000;

function unb64url(s: string) {
  const b = globalThis.atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export type Key = Uint8Array; // 32 raw bytes

export async function importKey(raw: string): Promise<Key> {
  const k = unb64url(raw);
  if (k.length !== 32) throw new Error("bad key");
  return k;
}

export async function encryptChunk(key: Key, plain: Uint8Array) {
  const iv = getRandomBytes(12);
  const ct = gcm(key, iv).encrypt(plain); // ciphertext followed by the 16-byte tag
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

// Locked accounts: unwrap the key with the passcode (PBKDF2-SHA256 → AES-GCM).
export async function unwrapKey(w: { salt: string; iv: string; ct: string; iter: number }, passcode: string) {
  try {
    const k = pbkdf2(sha256, new TextEncoder().encode(passcode.normalize("NFKC")), unb64url(w.salt), { c: w.iter, dkLen: 32 });
    const raw = gcm(k, unb64url(w.iv)).decrypt(unb64url(w.ct));
    return globalThis.btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return null;
  }
}

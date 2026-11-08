// AES-GCM with the account key, same shape as everywhere else: 12-byte IV +
// ciphertext + 16-byte tag per piece; plain pieces of 4,000,000 bytes.
// React Native has no WebCrypto; react-native-quick-crypto provides one.

import { install } from "react-native-quick-crypto";

install();
const subtle = (globalThis as unknown as { crypto: Crypto }).crypto.subtle;

export const CHUNK_PLAIN_BYTES = 4_000_000;

function unb64url(s: string) {
  const b = globalThis.atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export async function importKey(raw: string) {
  return subtle.importKey("raw", unb64url(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptChunk(key: CryptoKey, plain: Uint8Array) {
  const iv = (globalThis as unknown as { crypto: Crypto }).crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

// Locked accounts: unwrap the key with the passcode (PBKDF2-SHA256 → AES-GCM).
export async function unwrapKey(w: { salt: string; iv: string; ct: string; iter: number }, passcode: string) {
  try {
    const base = await subtle.importKey("raw", new TextEncoder().encode(passcode.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
    const k = await subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: unb64url(w.salt), iterations: w.iter }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const raw = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: unb64url(w.iv) }, k, unb64url(w.ct)));
    return globalThis.btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return null;
  }
}

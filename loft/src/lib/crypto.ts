"use client";

// Client-side encryption. Files are AES-GCM encrypted in the browser before
// upload and decrypted after download, so storage only ever holds ciphertext.
// The key belongs to the account: the server hands it to this browser after a
// sign-in, and signing out removes it from here again.

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

async function importKey(raw: string) {
  return crypto.subtle.importKey("raw", unb64url(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptBytes(plain: ArrayBuffer): Promise<Blob> {
  const raw = getRawKey();
  if (!raw) throw new Error("no-key");
  const key = await importKey(raw);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return new Blob([iv, ct], { type: "application/octet-stream" });
}

export async function decryptBytes(blob: ArrayBuffer): Promise<ArrayBuffer> {
  const raw = getRawKey();
  if (!raw) throw new Error("no-key");
  const key = await importKey(raw);
  const iv = new Uint8Array(blob.slice(0, 12));
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, blob.slice(12));
}

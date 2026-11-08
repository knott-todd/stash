"use client";

// Client-side encryption. The key is generated on this device and never sent to
// Loft. Files are AES-GCM encrypted in the browser before upload; the server and
// the storage supplier only ever hold ciphertext. The key travels to another
// device only inside a URL fragment (#k=...), which browsers never send to servers.

const KEY_STORE = "loft_key_v1";

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
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

export function ensureRawKey(): string {
  let raw = getRawKey();
  if (!raw) {
    raw = b64url(crypto.getRandomValues(new Uint8Array(16))); // AES-128-GCM
    setRawKey(raw);
  }
  return raw;
}

// Human-readable form of the key for the recovery card: 26 chars in groups of 4-5.
export function recoveryCode(raw = ensureRawKey()) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
  const bytes = unb64url(raw);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length || i < bits.length; i += 5) {
    out += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  }
  return out.match(/.{1,5}/g)!.join("-");
}

async function importKey(raw: string) {
  return crypto.subtle.importKey("raw", unb64url(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptBytes(plain: ArrayBuffer): Promise<Blob> {
  const key = await importKey(ensureRawKey());
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

// Build a link that carries the device identity (token) and the key (fragment only).
export function pairingUrl(path: string, token: string) {
  return `${location.origin}${path}?t=${token}#k=${ensureRawKey()}`;
}

// On a new device: adopt the key from the URL fragment, if present.
export function adoptKeyFromFragment() {
  const m = location.hash.match(/k=([A-Za-z0-9_-]+)/);
  if (m) {
    setRawKey(m[1]);
    history.replaceState(null, "", location.pathname + location.search);
    return true;
  }
  return false;
}

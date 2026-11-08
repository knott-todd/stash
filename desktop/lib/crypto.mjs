import { webcrypto } from "node:crypto";

// Same shape as the browser: AES-GCM, 12-byte IV + ciphertext + 16-byte tag per
// piece; plain pieces of 4,000,000 bytes.

export const CHUNK_PLAIN_BYTES = 4_000_000;
export const CHUNK_CIPHER_BYTES = CHUNK_PLAIN_BYTES + 28;

const subtle = webcrypto.subtle;

function unb64url(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export async function importKey(raw) {
  return subtle.importKey("raw", unb64url(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptChunk(key, plain) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return Buffer.concat([Buffer.from(iv), Buffer.from(ct)]);
}

// A small JPEG preview for images, if sharp is installed; otherwise none.
let sharp = undefined;
export async function makeThumb(filePath, mime) {
  if (!mime.startsWith("image/") || /svg|heic|heif/.test(mime)) return null;
  if (sharp === undefined) {
    try {
      sharp = (await import("sharp")).default;
    } catch {
      sharp = null;
    }
  }
  if (!sharp) return null;
  try {
    return await sharp(filePath, { failOn: "none" }).rotate().resize(320, 320, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  } catch {
    return null;
  }
}

// Locked accounts: the key arrives wrapped with a passcode (PBKDF2-SHA256 → AES-GCM).
export async function unwrapKey(w, passcode) {
  try {
    const base = await subtle.importKey("raw", new TextEncoder().encode(passcode.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
    const k = await subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: unb64url(w.salt), iterations: w.iter }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const raw = await subtle.decrypt({ name: "AES-GCM", iv: unb64url(w.iv) }, k, unb64url(w.ct));
    return Buffer.from(raw).toString("base64url");
  } catch {
    return null;
  }
}

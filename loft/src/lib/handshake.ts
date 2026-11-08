"use client";

// Device-to-device key hand-off through a relay that can't read it.
// Asker: makes an ephemeral ECDH keypair, shows its public key in a code.
// Approver: makes its own ephemeral keypair, derives a shared AES key with the
// asker's public key, encrypts the drive key, posts ciphertext + its public key.
// Asker: derives the same shared key, decrypts. Private keys never leave RAM.

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

export async function makeKeypair() {
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  const pub = b64(await crypto.subtle.exportKey("raw", kp.publicKey));
  return { kp, pub };
}

async function sharedKey(priv: CryptoKey, otherPub: string) {
  const other = await crypto.subtle.importKey("raw", unb64(otherPub), { name: "ECDH", namedCurve: "P-256" }, false, []);
  return crypto.subtle.deriveKey({ name: "ECDH", public: other }, priv, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// Approver side: wrap the raw drive key for the asker.
export async function sealKeyFor(askerPub: string, rawDriveKey: string) {
  const { kp, pub } = await makeKeypair();
  const k = await sharedKey(kp.privateKey, askerPub);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(rawDriveKey));
  return { approverPub: pub, iv: b64(iv), ct: b64(ct) };
}

// Asker side: unwrap with our private key and the approver's public key.
export async function openSealedKey(priv: CryptoKey, approverPub: string, iv: string, ct: string) {
  const k = await sharedKey(priv, approverPub);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, k, unb64(ct));
  return new TextDecoder().decode(pt);
}

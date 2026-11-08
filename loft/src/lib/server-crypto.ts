import { webcrypto } from "node:crypto";
import { CHUNK_CIPHER_BYTES } from "./files-limits";

// Server-side decryption, used only for public links on Standard accounts
// (where Stash holds the key). Same shapes as the browser: one block, or
// fixed-size blocks each with its own IV and tag.

export async function importRawKey(raw: string) {
  return webcrypto.subtle.importKey("raw", Buffer.from(raw, "base64url"), "AES-GCM", false, ["decrypt"]);
}

async function decryptBlock(key: CryptoKey, block: Uint8Array) {
  const iv = block.subarray(0, 12);
  return new Uint8Array(await webcrypto.subtle.decrypt({ name: "AES-GCM", iv }, key, block.subarray(12)));
}

// Turns a ciphertext stream into plaintext. One-piece files are a single block
// (the whole stream); pieced files are CHUNK_CIPHER_BYTES blocks, last one shorter.
export function decryptingStream(cipher: ReadableStream<Uint8Array>, key: CryptoKey, chunked: boolean): ReadableStream<Uint8Array> {
  const reader = cipher.getReader();
  let buf = new Uint8Array(0);
  const append = (a: Uint8Array, b: Uint8Array) => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        if (chunked && buf.length >= CHUNK_CIPHER_BYTES) {
          controller.enqueue(await decryptBlock(key, buf.subarray(0, CHUNK_CIPHER_BYTES)));
          buf = buf.subarray(CHUNK_CIPHER_BYTES);
          return;
        }
        const { value, done } = await reader.read();
        if (done) {
          if (buf.length) controller.enqueue(await decryptBlock(key, buf));
          return controller.close();
        }
        buf = append(buf, value);
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}

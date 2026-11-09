"use client";

import { decryptBytes, decryptFile, encryptBytes } from "./crypto";
import { cacheGet, cachePut } from "./filecache";
import { makeThumb } from "./thumb";
import type { FileRow } from "@/components/Drive";

// Previews for the grid and Photos views. A preview is a small encrypted JPEG
// stored next to the file. Here: fetch it, decrypt it, keep the object URL;
// and for older files without one, make it in the browser (download, decrypt,
// shrink, encrypt, attach), a couple at a time, only for files on screen.

const urls = new Map<string, Promise<string | null>>();
const THUMB_CACHE_PREFIX = "thumb:";
const GENERATE_MAX_BYTES = 25 * 1024 * 1024;

export function thumbUrl(f: FileRow): Promise<string | null> {
  const hit = urls.get(f.id);
  if (hit) return hit;
  const p = (async () => {
    if (f.thumb) {
      let cipher = await cacheGet(THUMB_CACHE_PREFIX + f.id);
      if (!cipher) {
        const r = await fetch(`/api/files/${f.id}/thumb`);
        if (!r.ok) return null;
        cipher = await r.arrayBuffer();
        cachePut(THUMB_CACHE_PREFIX + f.id, cipher);
      }
      const plain = await decryptBytes(cipher).catch(() => null);
      return plain ? URL.createObjectURL(new Blob([plain], { type: "image/jpeg" })) : null;
    }
    return generate(f);
  })();
  urls.set(f.id, p);
  p.then((u) => {
    if (!u) urls.delete(f.id);
  });
  return p;
}

// Older files: make the preview now and attach it for every device.
let running = 0;
const queue: (() => void)[] = [];
const slot = () => new Promise<void>((res) => (running < 2 ? (running++, res()) : queue.push(() => (running++, res()))));
const release = () => {
  running--;
  queue.shift()?.();
};

async function generate(f: FileRow): Promise<string | null> {
  if (!f.stored || !f.encrypted || !(f.mime.startsWith("image/") || f.mime.startsWith("video/")) || f.size > GENERATE_MAX_BYTES) return null;
  await slot();
  try {
    let cipher = await cacheGet(f.id);
    if (!cipher) {
      const r = await fetch(`/api/files/${f.id}/download`);
      if (!r.ok) return null;
      cipher = await r.arrayBuffer();
      cachePut(f.id, cipher);
    }
    const plain = await decryptFile(cipher, f.chunked);
    const thumb = await makeThumb(new File([plain], f.name, { type: f.mime }));
    if (!thumb) return null;
    const url = URL.createObjectURL(thumb);
    // Attach for next time and for other devices; best effort.
    (async () => {
      const enc = await encryptBytes(await thumb.arrayBuffer());
      const fd = new FormData();
      fd.set("thumb", enc, "thumb.stash");
      const r = await fetch(`/api/files/${f.id}/thumb`, { method: "PUT", body: fd });
      if (r.ok) cachePut(THUMB_CACHE_PREFIX + f.id, await enc.arrayBuffer());
    })().catch(() => {});
    return url;
  } catch {
    return null;
  } finally {
    release();
  }
}

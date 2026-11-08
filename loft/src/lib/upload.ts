"use client";

import { CHUNK_PLAIN_BYTES, encryptBytes } from "./crypto";
import { cachePut } from "./filecache";
import { makeThumb } from "./thumb";

// The one upload path for every file (drag-in, phone photos, Google copy).
// Encrypt in the browser, then hand the ciphertext to the server:
//   - small files: one multipart request to /api/files
//   - larger files: fixed-size pieces, each its own request to /api/files/part,
//     then one JSON request to /api/files that lists them
// Serverless hosts cap request bodies, so no single request carries more than
// one piece. Nothing is staged anywhere else.

import { MAX_BYTES } from "./files-limits";
export { MAX_BYTES };
export const DIRECT_MAX_BYTES = 4 * 1024 * 1024;
// Don't keep a local copy of very large files: memory, and it was just read from disk.
const CACHE_MAX_BYTES = 64 * 1024 * 1024;

export type UploadedFile = { id: string; name: string; size: number; folder: string };

type Mode = { maxBytes: number };
let mode: Promise<Mode> | null = null;
export function uploadMode(): Promise<Mode> {
  return (mode ??= fetch("/api/me")
    .then((r) => r.json())
    .then((m) => ({ maxBytes: Number(m.maxBytes) || MAX_BYTES }))
    .catch(() => ({ maxBytes: MAX_BYTES })));
}

export type UploadOpts = {
  folder?: string;
  source?: "upload" | "phone" | "google-drive" | "desktop";
  signal?: AbortSignal;
  modifiedAt?: number;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
};

// A request that storage asked us to retry: wait what it said (capped), then try again.
async function send(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { ...init, signal });
    if (r.status !== 503 || attempt >= 3) return r;
    const j = await r.clone().json().catch(() => ({}));
    const wait = Math.min(Number(j.retryAfter) || 5, 60);
    await new Promise((res, rej) => {
      const t = setTimeout(res, wait * 1000);
      signal?.addEventListener("abort", () => (clearTimeout(t), rej(new DOMException("aborted", "AbortError"))), { once: true });
    });
  }
}

export async function uploadEncrypted(file: File, opts: UploadOpts = {}): Promise<UploadedFile> {
  const { maxBytes } = await uploadMode();
  if (file.size > maxBytes) throw new Error("too-big");
  const meta: Record<string, string> = {
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: String(file.size),
    folder: opts.folder ?? "",
    source: opts.source ?? "upload",
    encrypted: "1",
    ...(opts.modifiedAt ? { modifiedAt: String(opts.modifiedAt) } : {}),
  };
  const thumb = await makeThumb(file).catch(() => null);

  let r: Response;
  let cipherForCache: Blob | null = null;
  if (file.size <= CHUNK_PLAIN_BYTES) {
    const cipher = await encryptBytes(await file.arrayBuffer());
    const fd = new FormData();
    fd.set("file", cipher, `${file.name}.stash`);
    if (thumb) fd.set("thumb", await encryptBytes(await thumb.arrayBuffer()), "thumb.stash");
    for (const [k, v] of Object.entries(meta)) fd.set(k, v);
    r = await send("/api/files", { method: "POST", body: fd }, opts.signal);
    cipherForCache = cipher;
    opts.onProgress?.(file.size, file.size);
  } else {
    // Pieces, two in flight, each piece retried on its own.
    const total = Math.ceil(file.size / CHUNK_PLAIN_BYTES);
    const parts: unknown[] = new Array(total);
    const cipherPieces: Blob[] = new Array(total);
    let next = 0;
    let sent = 0;
    const worker = async () => {
      while (next < total) {
        const i = next++;
        const plain = await file.slice(i * CHUNK_PLAIN_BYTES, (i + 1) * CHUNK_PLAIN_BYTES).arrayBuffer();
        const cipher = await encryptBytes(plain);
        const fd = new FormData();
        fd.set("piece", cipher, `${file.name}.part${i}.stash`);
        fd.set("name", file.name);
        fd.set("index", String(i));
        const pr = await send("/api/files/part", { method: "POST", body: fd }, opts.signal);
        const pj = await pr.json().catch(() => ({}));
        if (!pr.ok) throw new Error(pj.error ?? "upload-failed");
        parts[i] = pj.part;
        if (file.size <= CACHE_MAX_BYTES) cipherPieces[i] = cipher;
        sent += plain.byteLength;
        opts.onProgress?.(sent, file.size);
      }
    };
    await Promise.all([worker(), worker()]);
    const thumbPart = thumb ? await uploadThumb(thumb, file.name, opts.signal) : null;
    r = await send(
      "/api/files",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...meta, parts, ...(thumbPart ? { thumb: thumbPart } : {}) }) },
      opts.signal,
    );
    if (file.size <= CACHE_MAX_BYTES) cipherForCache = new Blob(cipherPieces);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "upload-failed");
  if (j.file?.id && cipherForCache) cachePut(j.file.id, cipherForCache); // it's on this device already
  return j.file;
}

async function uploadThumb(thumb: Blob, name: string, signal?: AbortSignal) {
  const fd = new FormData();
  fd.set("piece", await encryptBytes(await thumb.arrayBuffer()), `${name}.thumb.stash`);
  fd.set("name", `${name}.thumb`);
  fd.set("index", "0");
  const r = await send("/api/files/part", { method: "POST", body: fd }, signal);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j.part : null;
}

// Content fingerprint, so the same photo picked twice is skipped. Names and
// timestamps aren't reliable: iOS hands over many photos as "image.jpg".
export async function fingerprint(file: File) {
  const d = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(d).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

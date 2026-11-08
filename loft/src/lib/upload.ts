"use client";

import { upload as blobUpload } from "@vercel/blob/client";
import { encryptBytes } from "./crypto";
import { cachePut } from "./filecache";

// The one upload path for every file (drag-in, phone photos, Google copy).
// Encrypt in the browser, then hand the ciphertext to the server one of two ways:
//   - direct: multipart to /api/files (local dev, hosts without body limits)
//   - staged: browser → temporary blob store → the server tells storage to fetch it
//     (serverless hosts cap request bodies; files never pass through the function)
// The server says which, and the size cap, via /api/me.

export const MAX_BYTES = 50 * 1024 * 1024;
// Vercel functions accept bodies up to 4.5 MB; keep headroom for multipart framing.
export const DIRECT_MAX_BYTES = 4 * 1024 * 1024;

export type UploadedFile = { id: string; name: string; size: number; folder: string };

type Mode = { staged: boolean; maxBytes: number };
let mode: Promise<Mode> | null = null;
export function uploadMode(): Promise<Mode> {
  return (mode ??= fetch("/api/me")
    .then((r) => r.json())
    .then((m) => ({ staged: !!m.blobUploads, maxBytes: Number(m.maxBytes) || MAX_BYTES }))
    .catch(() => ({ staged: false, maxBytes: MAX_BYTES })));
}

export async function uploadEncrypted(
  file: File,
  opts: { folder?: string; source?: "upload" | "phone" | "google-drive"; signal?: AbortSignal } = {},
): Promise<UploadedFile> {
  const { staged, maxBytes } = await uploadMode();
  if (file.size > maxBytes) throw new Error("too-big");
  const cipher = await encryptBytes(await file.arrayBuffer());
  const meta = {
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: String(file.size),
    folder: opts.folder ?? "",
    source: opts.source ?? "upload",
    encrypted: "1",
  };

  let r: Response;
  // Small files skip the staging store even on serverless hosts: they fit under
  // the request cap, and every staged file spends three of the blob store's
  // metered operations. Only files that must be staged are.
  const needsStaging = staged && cipher.size > DIRECT_MAX_BYTES;
  if (needsStaging) {
    // Private: the staged ciphertext is readable only by our server, never by URL.
    let put;
    try {
      put = await blobUpload(`tmp/${file.name}.stash`, cipher, {
      access: "private",
      handleUploadUrl: "/api/blob",
      contentType: "application/octet-stream",
      abortSignal: opts.signal,
      });
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      throw new Error(`Files over ${Math.round(DIRECT_MAX_BYTES / 1024 / 1024)} MB can't be added right now. Smaller files still work.`);
    }
    r = await fetch("/api/files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...meta, blobUrl: put.url }),
      signal: opts.signal,
    });
  } else {
    const fd = new FormData();
    fd.set("file", cipher, `${file.name}.stash`);
    for (const [k, v] of Object.entries(meta)) fd.set(k, v);
    r = await fetch("/api/files", { method: "POST", body: fd, signal: opts.signal });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "upload-failed");
  if (j.file?.id) cachePut(j.file.id, cipher); // it's on this device already
  return j.file;
}

// Content fingerprint, so the same photo picked twice is skipped. Names and
// timestamps aren't reliable: iOS hands over many photos as "image.jpg".
export async function fingerprint(file: File) {
  const d = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(d).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

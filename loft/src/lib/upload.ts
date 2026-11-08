"use client";

import { encryptBytes } from "./crypto";
import { cachePut } from "./filecache";

export const MAX_BYTES = 50 * 1024 * 1024;

export type UploadedFile = { id: string; name: string; size: number; folder: string };

// Encrypt in the browser, then upload ciphertext with the original name and type.
export async function uploadEncrypted(
  file: File,
  opts: { folder?: string; source?: "upload" | "phone" } = {},
): Promise<UploadedFile> {
  if (file.size > MAX_BYTES) throw new Error("too-big");
  const cipher = await encryptBytes(await file.arrayBuffer());
  const fd = new FormData();
  fd.set("file", cipher, `${file.name}.loft`);
  fd.set("name", file.name);
  fd.set("mime", file.type || "application/octet-stream");
  fd.set("size", String(file.size));
  fd.set("folder", opts.folder ?? "");
  fd.set("source", opts.source ?? "upload");
  fd.set("encrypted", "1");
  const r = await fetch("/api/files", { method: "POST", body: fd });
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

"use client";

// Small preview of an image or video, made in the browser at upload time and
// stored encrypted next to the file. Grid and photo views show it instead of
// downloading the whole file.

export const THUMB_PX = 320;

export async function makeThumb(file: File): Promise<Blob | null> {
  if (file.type.startsWith("image/") && !/svg/.test(file.type)) return fromImage(file);
  if (file.type.startsWith("video/")) return fromVideo(file).catch(() => null);
  return null;
}

async function fromImage(file: File) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { resizeWidth: THUMB_PX, resizeQuality: "medium" } as ImageBitmapOptions);
  } catch {
    return null; // HEIC on a browser that can't decode it, broken file
  }
  return draw(bitmap, bitmap.width, bitmap.height);
}

async function fromVideo(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error("video"));
      setTimeout(() => rej(new Error("timeout")), 8000);
    });
    v.currentTime = Math.min(1, v.duration / 2 || 0);
    await new Promise<void>((res) => (v.onseeked = () => res()));
    return draw(v, v.videoWidth, v.videoHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function draw(src: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  if (!w || !h) return null;
  const scale = Math.min(1, THUMB_PX / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.8));
}

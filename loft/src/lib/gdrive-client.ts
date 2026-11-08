"use client";

import { encryptBytes } from "./crypto";
import { cachePut } from "./filecache";
import type { GFile } from "./google";

// Browser-side Google Drive copy: list → for each file, fetch bytes through our
// proxy, encrypt here, upload ciphertext. Progress survives reloads via a done-set
// in localStorage, so an interrupted copy resumes without duplicates.

export type CopyStatus =
  | { phase: "scanning" }
  | { phase: "copying" | "done" | "stopped"; total: number; bytes: number; copiedCount: number; copiedBytes: number; percent: number; skipped: number; failed: number };

// What the status line shows: the action, the file, where it came from and where it went.
export type CopyEvent = { action: string; name?: string; from: string; path?: string; to?: string };

const DONE_KEY = "loft_gd_done_v1";
const MAX = 50 * 1024 * 1024;

function doneSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}
function markDone(set: Set<string>, id: string) {
  set.add(id);
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...set]));
  } catch {}
}

export async function runGoogleCopy(
  onStatus: (s: CopyStatus) => void,
  onFilesChanged: () => void,
  signal?: AbortSignal,
  onEvent: (e: CopyEvent) => void = () => {},
) {
  onStatus({ phase: "scanning" });
  onEvent({ action: "Reading your Google Drive", from: "Google Drive" });
  const list = await fetch("/api/google/files", { signal }).then((r) => r.json());
  if (!list.connected || list.error) throw new Error(list.error ?? "not connected");
  const files: GFile[] = list.files;
  const done = doneSet();
  const total = files.length;
  const bytes = files.reduce((n, f) => n + f.size, 0);
  let copiedCount = 0;
  let copiedBytes = 0;
  let skipped = 0;
  let failed = 0;

  const emit = (phase: "copying" | "done" | "stopped") =>
    onStatus({ phase, total, bytes, copiedCount, copiedBytes, percent: total ? Math.round(((copiedCount + skipped + failed) / total) * 100) : 100, skipped, failed });

  // Already-copied files count immediately (resume).
  for (const f of files) {
    if (done.has(f.id)) {
      copiedCount++;
      copiedBytes += f.size;
    }
  }
  emit("copying");
  onEvent({ action: `Found ${total.toLocaleString()} files${copiedCount ? `, ${copiedCount.toLocaleString()} already in Loft` : ""}`, from: "Google Drive" });

  // Smallest first so the drive fills visibly within seconds; big videos last.
  // Empty files are real but uninteresting, so they go after everything else.
  const rank = (f: GFile) => (f.size === 0 ? Number.MAX_SAFE_INTEGER : f.size);
  const queue = files.filter((f) => !done.has(f.id)).sort((a, b) => rank(a) - rank(b));
  let sinceRefresh = 0;
  const worker = async () => {
    while (queue.length && !signal?.aborted) {
      const f = queue.shift()!;
      if (f.size > MAX) {
        skipped++;
        onEvent({ action: "Skipped (over 50 MB)", name: f.name, from: "Google Drive", path: f.folder });
        emit("copying");
        continue;
      }
      onEvent({ action: "Copying", name: f.name, from: "Google Drive", path: f.folder });
      try {
        const p = new URLSearchParams({ id: f.id });
        if (f.exportAs) p.set("export", f.exportAs);
        const r = await fetch(`/api/google/file?${p}`, { signal });
        if (!r.ok) throw new Error("fetch");
        const plain = await r.arrayBuffer();
        const cipher = await encryptBytes(plain);
        const fd = new FormData();
        fd.set("file", cipher, `${f.name}.loft`);
        fd.set("name", f.name);
        fd.set("mime", f.mimeType);
        fd.set("size", String(plain.byteLength));
        fd.set("folder", f.folder);
        fd.set("encrypted", "1");
        fd.set("source", "google-drive");
        const u = await fetch("/api/files", { method: "POST", body: fd, signal });
        if (!u.ok) throw new Error("upload");
        markDone(done, f.id);
        // We already hold the ciphertext: keep it so the file opens instantly.
        const { file: stored } = await u.json();
        if (stored?.id) cachePut(stored.id, cipher);
        onEvent({ action: "Saved", name: f.name, from: "Google Drive", path: f.folder, to: f.folder });
        copiedCount++;
        copiedBytes += plain.byteLength || f.size;
        if (++sinceRefresh >= 3) {
          sinceRefresh = 0;
          onFilesChanged();
        }
      } catch {
        if (signal?.aborted) return;
        failed++;
        onEvent({ action: "Couldn't copy, will retry", name: f.name, from: "Google Drive", path: f.folder });
      }
      emit("copying");
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  onFilesChanged();
  onEvent({ action: signal?.aborted ? "Stopped. Nothing is lost." : "Everything is in Loft.", from: "Google Drive" });
  emit(signal?.aborted ? "stopped" : "done");
}

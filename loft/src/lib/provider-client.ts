"use client";

import { uploadEncrypted, uploadMode } from "./upload";

// Browser-side copy from another drive: list → for each file, fetch bytes
// through our proxy, encrypt here, upload ciphertext. Progress survives reloads
// via a done-set in localStorage, so an interrupted copy resumes without
// duplicates. Google Drive and the other providers share this; only the
// endpoints and the label differ.

export type Provider = "google-drive" | "dropbox" | "onedrive";
export const PROVIDER_LABEL: Record<Provider, string> = { "google-drive": "Google Drive", dropbox: "Dropbox", onedrive: "OneDrive" };

export type CopyStatus =
  | { phase: "scanning" }
  | { phase: "copying" | "done" | "stopped"; total: number; bytes: number; copiedCount: number; copiedBytes: number; percent: number; skipped: number; failed: number };

// What the status line shows: the action, the file, where it came from and where it went.
export type CopyEvent = { action: string; name?: string; from: string; path?: string; to?: string };

type Listed = { id: string; name: string; mimeType: string; size: number; folder: string; exportAs?: string };

const endpoints = (p: Provider) =>
  p === "google-drive" ? { list: "/api/google/files", file: "/api/google/file", auth: "/api/google/auth", disconnect: "/api/google" } : { list: `/api/providers/${p}/files`, file: `/api/providers/${p}/file`, auth: `/api/providers/${p}/auth`, disconnect: `/api/providers/${p}/files` };
export const providerEndpoints = endpoints;

export const doneKey = (p: Provider) => (p === "google-drive" ? "stash_gd_done_v1" : `stash_${p}_done_v1`);

function doneSet(p: Provider): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(doneKey(p)) ?? "[]"));
  } catch {
    return new Set();
  }
}
function markDone(p: Provider, set: Set<string>, id: string) {
  set.add(id);
  try {
    localStorage.setItem(doneKey(p), JSON.stringify([...set]));
  } catch {}
}

export async function runProviderCopy(
  p: Provider,
  onStatus: (s: CopyStatus) => void,
  onFilesChanged: () => void,
  signal?: AbortSignal,
  onEvent: (e: CopyEvent) => void = () => {},
) {
  const label = PROVIDER_LABEL[p];
  const ep = endpoints(p);
  onStatus({ phase: "scanning" });
  onEvent({ action: `Reading your ${label}`, from: label });
  const list = await fetch(ep.list, { signal }).then((r) => r.json());
  if (!list.connected || list.error) throw new Error(list.error ?? "not connected");
  const files: Listed[] = list.files;
  const done = doneSet(p);
  const total = files.length;
  const bytes = files.reduce((n, f) => n + f.size, 0);
  let copiedCount = 0;
  let copiedBytes = 0;
  let skipped = 0;
  let failed = 0;

  const emit = (phase: "copying" | "done" | "stopped") =>
    onStatus({ phase, total, bytes, copiedCount, copiedBytes, percent: total ? Math.round(((copiedCount + skipped + failed) / total) * 100) : 100, skipped, failed });

  for (const f of files) {
    if (done.has(f.id)) {
      copiedCount++;
      copiedBytes += f.size;
    }
  }
  emit("copying");
  onEvent({ action: `Found ${total.toLocaleString()} files${copiedCount ? `, ${copiedCount.toLocaleString()} already in Stash` : ""}`, from: label });

  // Smallest first so the drive fills visibly within seconds; big videos last.
  const rank = (f: Listed) => (f.size === 0 ? Number.MAX_SAFE_INTEGER : f.size);
  const { maxBytes: MAX } = await uploadMode();
  const queue = files.filter((f) => !done.has(f.id)).sort((a, b) => rank(a) - rank(b));
  let sinceRefresh = 0;
  const worker = async () => {
    while (queue.length && !signal?.aborted) {
      const f = queue.shift()!;
      if (f.size > MAX) {
        skipped++;
        onEvent({ action: `Skipped (over ${Math.round(MAX / 1024 / 1024 / 1024)} GB)`, name: f.name, from: label, path: f.folder });
        emit("copying");
        continue;
      }
      onEvent({ action: "Copying", name: f.name, from: label, path: f.folder });
      try {
        const q = new URLSearchParams({ id: f.id });
        if (f.exportAs) q.set("export", f.exportAs);
        const r = await fetch(`${ep.file}?${q}`, { signal });
        if (!r.ok) throw new Error("fetch");
        const plain = await r.arrayBuffer();
        await uploadEncrypted(new File([plain], f.name, { type: f.mimeType }), { folder: f.folder, source: p, signal });
        markDone(p, done, f.id);
        onEvent({ action: "Saved", name: f.name, from: label, path: f.folder, to: f.folder });
        copiedCount++;
        copiedBytes += plain.byteLength || f.size;
        if (++sinceRefresh >= 3) {
          sinceRefresh = 0;
          onFilesChanged();
        }
      } catch {
        if (signal?.aborted) return;
        failed++;
        onEvent({ action: "Couldn't copy, will retry", name: f.name, from: label, path: f.folder });
      }
      emit("copying");
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  onFilesChanged();
  onEvent({ action: signal?.aborted ? "Stopped. Nothing is lost." : "Everything is in Stash.", from: label });
  emit(signal?.aborted ? "stopped" : "done");
}

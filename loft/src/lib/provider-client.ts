"use client";

import { uploadEncrypted, uploadMode } from "./upload";
import { getRawKey } from "./crypto";
import { reportCopy } from "./copy-client";

// Browser-side copy from another drive, for passcode-locked accounts (Stash can't
// encrypt for them, so the server can't copy for them; Standard accounts copy on the
// server, see copyjob.ts). List → for each file, fetch bytes through our proxy, encrypt
// here, upload ciphertext. Progress survives reloads via a done-set in localStorage and
// is reported to the server record, so Settings and other tabs see it.
//
// Nothing short of Stop ends it: a dropped connection, a sleeping laptop or a busy
// server pauses the copy and it carries on when things answer again. Only a file the
// other drive refuses for good (gone, too large to export) is set aside after a few tries.

export type Provider = "google-drive" | "dropbox" | "onedrive";
export const PROVIDER_LABEL: Record<Provider, string> = { "google-drive": "Google Drive", dropbox: "Dropbox", onedrive: "OneDrive" };

type Counts = { total: number; bytes: number; copiedCount: number; copiedBytes: number; percent: number; skipped: number; failed: number };
export type CopyStatus = { phase: "scanning" } | ({ phase: "copying" | "waiting" | "done" | "stopped"; note?: string } & Counts);

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

class Fail extends Error {
  constructor(public final: boolean, message: string) {
    super(message);
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), res()), { once: true });
  });

// Waits until `until`, or sooner when the connection comes back or the tab is looked at
// again (a laptop opening up). Says which, so a wake-up can retry at once.
function pause(until: number, signal?: AbortSignal) {
  return new Promise<"time" | "woke">((res) => {
    const done = (why: "time" | "woke") => {
      clearTimeout(t);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", vis);
      res(why);
    };
    const online = () => done("woke");
    const vis = () => document.visibilityState === "visible" && done("woke");
    const t = setTimeout(() => done("time"), Math.max(0, until - Date.now()));
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", vis);
    signal?.addEventListener("abort", () => done("time"), { once: true });
  });
}

// A download that sends nothing for 90 s is dead (typical after a laptop wakes up).
async function readAll(r: Response, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (!r.body) return r.arrayBuffer();
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    let t: ReturnType<typeof setTimeout> | undefined;
    const idle = new Promise<never>((_, rej) => (t = setTimeout(() => rej(new Fail(false, "went quiet")), 90_000)));
    try {
      const { value, done } = await Promise.race([reader.read(), idle]);
      if (done) break;
      chunks.push(value);
      n += value.length;
    } catch (e) {
      reader.cancel().catch(() => {});
      throw e;
    } finally {
      clearTimeout(t);
    }
    if (signal?.aborted) throw new Fail(false, "stopped");
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
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

  // The listing, retried until it answers (or Stop).
  let files: Listed[] = [];
  for (let strikes = 0; ; strikes++) {
    if (signal?.aborted) return;
    try {
      const r = await fetch(ep.list, { signal });
      const list = await r.json();
      if (list.connected === false) throw new Error("not connected");
      if (!r.ok || list.error) throw new Fail(false, list.error ?? "list failed");
      files = list.files;
      break;
    } catch (e) {
      if (signal?.aborted) return;
      if (e instanceof Error && e.message === "not connected") throw e;
      onEvent({ action: navigator.onLine ? `${label} isn't answering. Trying again shortly.` : "Waiting for the internet", from: label });
      await pause(Date.now() + Math.min(5 * 60_000, 10_000 * 2 ** Math.min(strikes, 5)), signal);
    }
  }

  const done = doneSet(p);
  const total = files.length;
  const bytes = files.reduce((n, f) => n + f.size, 0);
  let copiedCount = 0;
  let copiedBytes = 0;
  let skipped = 0;
  let failed = 0;
  let note: string | undefined;
  let waiting = false;

  // The done-set is written at most once a second: rewriting thousands of ids per file was slow.
  let dirty = false;
  const flush = () => {
    if (!dirty) return;
    dirty = false;
    try {
      localStorage.setItem(doneKey(p), JSON.stringify([...done]));
    } catch {}
  };
  const flushTimer = setInterval(flush, 1000);
  window.addEventListener("pagehide", flush);

  let lastReport = 0;
  let lastName: { name: string; folder: string } | undefined;
  const report = (state: "running" | "done" | "stopped", force = false) => {
    if (!force && Date.now() - lastReport < 10_000) return;
    lastReport = Date.now();
    reportCopy(p, { state, total, bytes, copied: copiedCount, copiedBytes, failed, skipped, last: lastName });
  };

  const emit = (phase: "copying" | "done" | "stopped") => {
    const shown = phase === "copying" && waiting ? "waiting" : phase;
    onStatus({ phase: shown, note, total, bytes, copiedCount, copiedBytes, percent: total ? Math.round(((copiedCount + skipped + failed) / total) * 100) : 100, skipped, failed });
    report(phase === "copying" ? "running" : phase, phase !== "copying");
  };

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
  const attempts = new Map<string, number>();
  let inflight = 0;
  let pausedUntil = 0;
  let strikes = 0; // failures in a row across all workers
  let sinceRefresh = 0;
  let lastRefresh = Date.now();

  const gate = async () => {
    while (!signal?.aborted && (Date.now() < pausedUntil || !navigator.onLine || !getRawKey())) {
      waiting = true;
      note = !navigator.onLine ? "Waiting for the internet. The copy carries on by itself." : !getRawKey() ? "Unlock your files to keep copying." : `${label} or Stash isn't answering. Trying again shortly.`;
      emit("copying");
      const why = await pause(!navigator.onLine || !getRawKey() ? Date.now() + 5_000 : pausedUntil, signal);
      if (why === "woke") {
        pausedUntil = 0;
        strikes = 0;
      }
    }
    if (waiting) {
      waiting = false;
      note = undefined;
      emit("copying");
    }
  };

  const worker = async () => {
    while (!signal?.aborted) {
      await gate();
      if (signal?.aborted) return;
      const f = queue.shift();
      if (!f) {
        if (inflight === 0) return;
        await sleep(300, signal);
        continue;
      }
      if (f.size > MAX) {
        skipped++;
        onEvent({ action: `Skipped (over ${Math.round(MAX / 1024 / 1024 / 1024)} GB)`, name: f.name, from: label, path: f.folder });
        emit("copying");
        continue;
      }
      inflight++;
      onEvent({ action: "Copying", name: f.name, from: label, path: f.folder });
      try {
        const q = new URLSearchParams({ id: f.id });
        if (f.exportAs) q.set("export", f.exportAs);
        const r = await fetch(`${ep.file}?${q}`, { signal });
        if (r.status === 422) throw new Fail(true, (await r.json().catch(() => ({}))).error ?? "refused");
        if (!r.ok) throw new Fail(false, `fetch ${r.status}`);
        const plain = await readAll(r, signal);
        await uploadEncrypted(new File([plain], f.name, { type: f.mimeType }), { folder: f.folder, source: p, signal });
        done.add(f.id);
        dirty = true;
        strikes = 0;
        lastName = { name: f.name, folder: f.folder };
        onEvent({ action: "Saved", name: f.name, from: label, path: f.folder, to: f.folder });
        copiedCount++;
        copiedBytes += plain.byteLength || f.size;
        // Refresh the drive sparingly: every listing is read from the database, which is metered.
        if (++sinceRefresh >= 25 || Date.now() - lastRefresh > 20000) {
          sinceRefresh = 0;
          lastRefresh = Date.now();
          onFilesChanged();
        }
      } catch (e) {
        if (signal?.aborted) return;
        const final = (e instanceof Fail && e.final) || (e instanceof Error && e.message === "too-big");
        if (e instanceof Error && e.message === "too-big") {
          skipped++;
        } else if (final) {
          // Refused for good: three tries, then it's set aside (Resume gives it another go).
          const n = (attempts.get(f.id) ?? 0) + 1;
          attempts.set(f.id, n);
          if (n >= 3) {
            failed++;
            onEvent({ action: "Couldn't copy, set aside", name: f.name, from: label, path: f.folder });
          } else queue.push(f);
        } else {
          // The connection, a sleeping laptop, a busy server: put it back and wait.
          queue.unshift(f);
          strikes++;
          if (strikes >= 2) pausedUntil = Date.now() + Math.min(60_000, 5_000 * 2 ** Math.min(strikes - 2, 4));
          onEvent({ action: "Connection trouble, will retry", name: f.name, from: label, path: f.folder });
        }
      } finally {
        inflight--;
      }
      emit("copying");
    }
  };
  try {
    await Promise.all([worker(), worker(), worker(), worker()]);
  } finally {
    clearInterval(flushTimer);
    window.removeEventListener("pagehide", flush);
    flush();
  }
  onFilesChanged();
  onEvent({ action: signal?.aborted ? "Stopped. Nothing is lost." : "Everything is in Stash.", from: label });
  // An abort is a Stop only when the caller says so (it reports that itself); leaving the page is not.
  if (!signal?.aborted) emit("done");
  else onStatus({ phase: "stopped", total, bytes, copiedCount, copiedBytes, percent: total ? Math.round(((copiedCount + skipped + failed) / total) * 100) : 100, skipped, failed });
}

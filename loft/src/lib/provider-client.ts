"use client";

import { uploadEncrypted, uploadMode } from "./upload";
import { getRawKey } from "./crypto";
import type { CopyRecord } from "./copy-types";
import type { BrowserFile } from "./copy-types";

// Browser-side copy from another drive, for passcode-locked accounts (Stash can't
// encrypt for them, so the server can't copy for them; Standard accounts copy on the
// server, see copyjob.ts). The server still reads the drive into its queue; this takes
// a few files at a time, fetches each through our proxy, encrypts it here, uploads the
// ciphertext and ticks it off. The list itself never comes to the browser: a large
// drive's is far bigger than one response may carry.
//
// Nothing short of Stop ends it: a dropped connection, a sleeping laptop or a busy
// server pauses the copy and it carries on when things answer again. Only a file the
// other drive refuses for good (gone, too large to export) is set aside after a few tries.

export type Provider = "google-drive" | "dropbox" | "onedrive";
export const PROVIDER_LABEL: Record<Provider, string> = { "google-drive": "Google Drive", dropbox: "Dropbox", onedrive: "OneDrive" };

type Counts = { total: number; bytes: number; copiedCount: number; copiedBytes: number; percent: number; skipped: number; failed: number };
export type CopyStatus = { phase: "scanning"; total?: number; bytes?: number } | ({ phase: "copying" | "waiting" | "done" | "stopped"; note?: string } & Counts);

// What the status line shows: the action, the file, where it came from and where it went.
export type CopyEvent = { action: string; name?: string; from: string; path?: string; to?: string };


const endpoints = (p: Provider) =>
  p === "google-drive" ? { list: "/api/google/files", file: "/api/google/file", auth: "/api/google/auth", disconnect: "/api/google" } : { list: `/api/providers/${p}/files`, file: `/api/providers/${p}/file`, auth: `/api/providers/${p}/auth`, disconnect: `/api/providers/${p}/files` };
export const providerEndpoints = endpoints;

// The done-list older browser copies kept here. Only read now to spot a copy begun
// before copies lived on the server; the server's queue is the record.
export const doneKey = (p: Provider) => (p === "google-drive" ? "stash_gd_done_v1" : `stash_${p}_done_v1`);

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
  let rec: CopyRecord | null = null;
  let halted = false; // Stop pressed (here or on another device), or finished
  let waiting = false;
  let note: string | undefined;

  const counts = (r: CopyRecord) => ({
    total: r.total,
    bytes: r.bytes,
    copiedCount: r.copied,
    copiedBytes: r.copiedBytes,
    skipped: r.skipped,
    failed: r.failed,
    percent: r.total ? Math.round(((r.copied + r.skipped) / r.total) * 100) : 0,
  });
  const emit = () => {
    if (rec && rec.state !== "listing") onStatus({ phase: waiting ? "waiting" : "copying", note, ...counts(rec) });
  };
  const take = (r: CopyRecord | null | undefined) => {
    if (!r) return;
    rec = r;
    if (r.state !== "running" && r.state !== "listing") halted = true;
    emit();
  };
  const post = async (body: object) => {
    const r = await fetch("/api/copy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: p, ...body }), signal });
    if (!r.ok) throw new Fail(false, `copy ${r.status}`);
    return r.json();
  };

  // 1. The server reads the drive into the queue. Wait for it, showing what it has found.
  onStatus({ phase: "scanning" });
  onEvent({ action: `Reading your ${label}`, from: label });
  for (let strikes = 0; !signal?.aborted; ) {
    try {
      const j = await fetch("/api/copy", { signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
      const r: CopyRecord | undefined = (j.copies as CopyRecord[]).find((c) => c.provider === p);
      strikes = 0;
      if (!r || r.state === "stopped" || r.state === "done") return;
      if (r.state === "reconnect") throw new Error("not connected");
      if (r.state === "running") {
        take(r);
        break;
      }
      onStatus({ phase: "scanning", ...(r.total ? { total: r.total, bytes: r.bytes } : {}) });
      await sleep(3000, signal);
    } catch (e) {
      if (signal?.aborted) return;
      if (e instanceof Error && e.message === "not connected") throw e;
      strikes++;
      await pause(Date.now() + Math.min(60_000, 5_000 * 2 ** Math.min(strikes, 4)), signal);
    }
  }
  if (signal?.aborted || !rec) return;
  onEvent({ action: `Found ${(rec as CopyRecord).total.toLocaleString()} files${(rec as CopyRecord).copied ? `, ${(rec as CopyRecord).copied.toLocaleString()} already in Stash` : ""}`, from: label });

  // 2. Copy from the queue, a few files at a time, ticking each off as soon as it's stored.
  const { maxBytes: MAX } = await uploadMode();
  const queue: BrowserFile[] = [];
  const inflight = new Set<string>();
  let exhausted = false;
  let refilling: Promise<void> | null = null;
  let pausedUntil = 0;
  let strikes = 0; // failures in a row across all workers
  let sinceRefresh = 0;
  let lastRefresh = Date.now();

  const refill = () =>
    (refilling ??= (async () => {
      try {
        const j = await post({ action: "next", n: 20, exclude: [...queue.map((f) => f.fid), ...inflight] });
        take(j.copy);
        const files = j.files as BrowserFile[];
        if (!files.length && !queue.length && !inflight.size) exhausted = true;
        queue.push(...files);
      } catch {
        if (!signal?.aborted) {
          strikes++;
          pausedUntil = Date.now() + Math.min(60_000, 5_000 * 2 ** Math.min(strikes, 4));
        }
      } finally {
        refilling = null;
      }
    })());

  // Ticking off is retried until the server hears it: a file stored but not ticked off would be copied again.
  const mark = async (fid: string, outcome: "done" | "final" | "skipped", error?: string) => {
    for (let n = 0; !signal?.aborted || outcome === "done"; n++) {
      try {
        take((await post({ action: "mark", results: [{ fid, outcome, error }] })).copy);
        return;
      } catch {
        if (n > 20) return;
        await sleep(Math.min(30_000, 1000 * 2 ** Math.min(n, 5)));
      }
    }
  };

  const gate = async () => {
    while (!signal?.aborted && !halted && (Date.now() < pausedUntil || !navigator.onLine || !getRawKey())) {
      waiting = true;
      note = !navigator.onLine ? "Waiting for the internet. The copy carries on by itself." : !getRawKey() ? "Unlock your files to keep copying." : `${label} or Stash isn't answering. Trying again shortly.`;
      emit();
      const why = await pause(!navigator.onLine || !getRawKey() ? Date.now() + 5_000 : pausedUntil, signal);
      if (why === "woke") {
        pausedUntil = 0;
        strikes = 0;
      }
    }
    if (waiting) {
      waiting = false;
      note = undefined;
      emit();
    }
  };

  const worker = async () => {
    while (!signal?.aborted && !halted && !exhausted) {
      await gate();
      if (signal?.aborted || halted) return;
      if (queue.length < 4) {
        const r = refill();
        if (!queue.length) {
          await r;
          if (!queue.length) {
            if (exhausted) return;
            await sleep(inflight.size ? 500 : 1000, signal);
            continue;
          }
        }
      }
      const f = queue.shift();
      if (!f) continue;
      if (f.item.size > MAX) {
        onEvent({ action: `Skipped (over ${Math.round(MAX / 1024 / 1024 / 1024)} GB)`, name: f.item.name, from: label, path: f.item.folder });
        await mark(f.fid, "skipped");
        continue;
      }
      inflight.add(f.fid);
      onEvent({ action: "Copying", name: f.item.name, from: label, path: f.item.folder });
      try {
        const q = new URLSearchParams({ id: f.fid });
        if (f.item.exportAs) q.set("export", f.item.exportAs);
        const r = await fetch(`${ep.file}?${q}`, { signal });
        if (r.status === 422) throw new Fail(true, (await r.json().catch(() => ({}))).error ?? "refused");
        if (!r.ok) throw new Fail(false, `fetch ${r.status}`);
        const plain = await readAll(r, signal);
        await uploadEncrypted(new File([plain], f.item.name, { type: f.item.mime }), { folder: f.item.folder, source: p, signal });
        strikes = 0;
        await mark(f.fid, "done");
        onEvent({ action: "Saved", name: f.item.name, from: label, path: f.item.folder, to: f.item.folder });
        // Refresh the drive sparingly: every listing is read from the database, which is metered.
        if (++sinceRefresh >= 25 || Date.now() - lastRefresh > 20000) {
          sinceRefresh = 0;
          lastRefresh = Date.now();
          onFilesChanged();
        }
      } catch (e) {
        if (signal?.aborted) return;
        if (e instanceof Error && e.message === "too-big") await mark(f.fid, "skipped");
        else if (e instanceof Fail && e.final) {
          // Refused for good: the server sets it aside after a few of these (Resume gives it another go).
          onEvent({ action: "Couldn't copy, will try once more later", name: f.item.name, from: label, path: f.item.folder });
          await mark(f.fid, "final", e.message);
        } else {
          // The connection, a sleeping laptop, a busy server: keep it and wait.
          queue.push(f);
          strikes++;
          if (strikes >= 2) pausedUntil = Date.now() + Math.min(60_000, 5_000 * 2 ** Math.min(strikes - 2, 4));
          onEvent({ action: "Connection trouble, will retry", name: f.item.name, from: label, path: f.item.folder });
        }
      } finally {
        inflight.delete(f.fid);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  onFilesChanged();
  if (exhausted) {
    // The server marks the copy finished when asked for more and there is none.
    await refill();
    onEvent({ action: "Everything is in Stash.", from: label });
  } else if (signal?.aborted || halted) onEvent({ action: "Stopped. Nothing is lost.", from: label });
}

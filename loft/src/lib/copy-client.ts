"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { remaining, type CopyProvider, type CopyRecord } from "./copy-types";

// The pages' view of copies from other drives. The record lives on the server, so the
// progress bar is the same on every page, in every tab and on every device, and comes
// back whenever Stash is opened again. While a copy is moving it is checked every few
// seconds (a few hundred bytes each time); otherwise not at all.

export type { CopyProvider, CopyRecord };
export { remaining };

type Snap = { copies: CopyRecord[]; loaded: boolean };
let snap: Snap = { copies: [], loaded: false };
const listeners = new Set<() => void>();
const set = (copies: CopyRecord[]) => {
  snap = { copies, loaded: true };
  listeners.forEach((l) => l());
};

export async function loadCopies() {
  const j = await fetch("/api/copy")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (j?.copies) set(j.copies as CopyRecord[]);
  return snap.copies;
}

export async function copyAction(provider: CopyProvider, action: "start" | "resume" | "stop" | "forget"): Promise<{ copy?: CopyRecord; reconnect?: boolean }> {
  const r = await fetch("/api/copy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, action }) });
  const j = await r.json().catch(() => ({}));
  await loadCopies();
  return j;
}

// The browser copy (passcode accounts) says where it is. Throttled by the caller.
export function reportCopy(provider: CopyProvider, status: Partial<CopyRecord>) {
  return fetch("/api/copy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, action: "report", status }), keepalive: true }).catch(() => {});
}

const moving = (c: CopyRecord) => c.state === "running" || c.state === "listing";

export function useCopies(enabled = true) {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snap,
    () => snap,
  );
  useEffect(() => {
    if (enabled) loadCopies();
  }, [enabled]);
  const active = s.copies.some(moving);
  useEffect(() => {
    if (!enabled || !active) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadCopies();
    }, 3000);
    const back = () => document.visibilityState === "visible" && loadCopies();
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
  }, [enabled, active]);
  return s;
}

// The copy to show: one that is moving, else the one touched last.
export function currentCopy(copies: CopyRecord[]): CopyRecord | null {
  return copies.find(moving) ?? [...copies].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

// Calls `fn` when more files have arrived from a copy, at most every `ms`.
export function useOnCopied(copies: CopyRecord[], fn: () => void, ms = 15_000) {
  const last = useRef<{ n: number; at: number } | null>(null);
  useEffect(() => {
    const n = copies.reduce((a, c) => a + c.copied, 0);
    const prev = last.current;
    if (!prev) {
      last.current = { n, at: Date.now() };
      return;
    }
    if (n === prev.n) return;
    const fire = () => {
      last.current = { n, at: Date.now() };
      fn();
    };
    const wait = ms - (Date.now() - prev.at);
    if (wait <= 0) return fire();
    const t = setTimeout(fire, wait);
    return () => clearTimeout(t);
  }, [copies, fn, ms]);
}

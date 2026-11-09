import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { store } from "./store";

// Fixed-window rate limits and per-account upload budgets, counted in kv.
// A window is `rl:<scope>:<who>:<window number>`; old windows are swept daily.

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

// Count one hit. Returns null when within the limit, else a 429 response.
export async function limit(scope: string, who: string, max: number, windowSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const win = Math.floor(now / windowSeconds);
  const n = await store().kvIncr(`rl:${scope}:${who}:${win}`, 1);
  if (n <= max) return null;
  const retry = (win + 1) * windowSeconds - now;
  return NextResponse.json({ error: "Too many requests. Try again shortly.", retryAfter: retry }, { status: 429, headers: { "retry-after": String(retry) } });
}

// Bytes an account may send per hour. Over it, storage says "busy" with when to
// retry, which every client already honours (503 + retryAfter).
export const BUDGET_BYTES_PER_HOUR = 10 * 1024 * 1024 * 1024;

export async function spendBudget(uid: string, bytes: number) {
  const now = Math.floor(Date.now() / 1000);
  const hour = Math.floor(now / 3600);
  const used = await store().kvIncr(`rl:budget:${uid}:${hour}`, bytes);
  if (used <= BUDGET_BYTES_PER_HOUR) return null;
  const retry = (hour + 1) * 3600 - now;
  return NextResponse.json(
    { error: "You've sent a lot this hour. Backup carries on shortly.", retryAfter: retry },
    { status: 503, headers: { "retry-after": String(retry) } },
  );
}

// Windows older than the current one are dead weight: drop them.
export async function sweepLimits() {
  const db = store();
  const rows = await db.kvList("rl:");
  const now = Math.floor(Date.now() / 1000);
  let n = 0;
  for (const r of rows) {
    const win = Number(r.key.slice(r.key.lastIndexOf(":") + 1));
    // Budgets are hourly, limits are at most hourly: anything older than two hours is over.
    if (Number.isFinite(win) && win * 60 < now - 2 * 3600) {
      await db.kvDelete(r.key);
      n++;
    }
  }
  return n;
}

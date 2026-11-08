import { NextResponse } from "next/server";
import { publicFile, type StoredPart } from "./store";
import type { StorageBusy } from "./telegram";

// Helpers shared by the file routes (route files may only export handlers).

export const ONE_PIECE_MAX = 4 * 1024 * 1024; // what one request may carry on serverless hosts

export function busy(e: StorageBusy) {
  const mins = Math.max(1, Math.ceil(e.retryAfterSeconds / 60));
  return NextResponse.json(
    { error: `Storage is busy right now. Try again in about ${mins} minute${mins > 1 ? "s" : ""}.`, retryAfter: e.retryAfterSeconds },
    { status: 503, headers: { "retry-after": String(e.retryAfterSeconds) } },
  );
}

export const isPart = (p: unknown): p is StoredPart =>
  !!p && typeof p === "object" && typeof (p as StoredPart).size === "number" && (!!(p as StoredPart).tg?.fileId || typeof (p as StoredPart).blob === "string");

export const pub = publicFile;

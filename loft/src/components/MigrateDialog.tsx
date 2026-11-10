"use client";

import { useEffect, useState } from "react";
import { fmtBytes } from "@/lib/format";
import { IconButton } from "./Drive";
import type { CopyRecord } from "@/lib/copy-types";
import { PROVIDER_LABEL } from "@/lib/provider-client";

type Counts = { total: number; bytes: number; copiedCount: number; copiedBytes: number; percent: number; skipped?: number; failed?: number };
export type MigrationStatus =
  | { phase: "idle" }
  | { phase: "scanning"; total?: number; bytes?: number; resume?: Counts }
  | ({ phase: "copying" | "done" | "stopped" | "waiting" | "reconnect"; note?: string } & Counts);

// Files that still aren't in Stash: not copied, and not too big to copy.
export const left = (s: Counts) => Math.max(0, s.total - s.copiedCount - (s.skipped ?? 0));

// The server's record of a move, as the banner and dialog show it.
export function statusOf(r: CopyRecord, now = Date.now()): MigrationStatus {
  const c: Counts = {
    total: r.total,
    bytes: r.bytes,
    copiedCount: r.copied,
    copiedBytes: r.copiedBytes,
    skipped: r.skipped,
    failed: r.failed,
    percent: r.total ? Math.round(((r.copied + r.skipped) / r.total) * 100) : 0,
  };
  const label = PROVIDER_LABEL[r.provider];
  if (r.state === "listing") return { phase: "scanning", resume: r.copied > 0 ? c : undefined };
  if (r.state === "running" && r.waitUntil && r.waitUntil > now) {
    const mins = Math.max(1, Math.round((r.waitUntil - now) / 60_000));
    const note = r.waitReason === "busy" ? `Storage asked for a pause. Carrying on by itself in about ${mins} min.` : `${label} isn't answering right now. Trying again by itself in about ${mins} min.`;
    return { phase: "waiting", note, ...c };
  }
  if (r.state === "running") return { phase: "copying", ...c };
  return { phase: r.state, ...c };
}

// With Google configured, "Allow" goes to Google's real consent screen and the
// copy runs in the browser. Without it, the consent step is a stand-in and the
// migration is simulated server-side.
export function MigrateDialog({
  open,
  status,
  real = false,
  label = "Google Drive",
  onClose,
  onStart,
  onStop,
  onSwitchAccount,
  onReconnect,
  where = null,
}: {
  open: boolean;
  status: MigrationStatus;
  real?: boolean;
  label?: string;
  onClose: () => void;
  onStart: () => void;
  onStop?: () => void;
  onSwitchAccount?: () => void;
  onReconnect?: () => void;
  where?: "server" | "browser" | null;
}) {
  const [step, setStep] = useState<"consent" | "progress">("consent");

  useEffect(() => {
    if (open) setStep(status.phase === "idle" ? "consent" : "progress");
  }, [open, status.phase]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-ink/40 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="migrate-title"
        className="card w-full max-w-md bg-cream p-6 rise"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "consent" && (
          <>
            <h2 id="migrate-title" className="text-2xl font-semibold">
              Move my {label}
            </h2>
            <p className="mt-2 text-ink-2">
              {where === "browser"
                ? `Stash copies every file and folder from your ${label}, encrypted on this device as it arrives. Keep Stash open on this device until it's done. Nothing is deleted there.`
                : `Stash copies every file and folder from your ${label}, encrypted as it arrives. It runs on Stash's servers, so you can close this tab. Nothing is deleted there.`}
            </p>
            {real ? (
              <div className="mt-4 text-sm text-ink-2">
                <p className="flex items-center gap-2">
                  {label === "Google Drive" && <GoogleG />} {label} will ask you to allow read-only access. Stash never gets your {label} password.
                </p>
                {onSwitchAccount && (
                  <button className="mt-2 text-ink-3 hover:text-ink underline underline-offset-2" onClick={onSwitchAccount} data-testid="switch-google">
                    Use a different {label === "Google Drive" ? "Google" : label} account
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-line bg-white p-4 text-sm">
                <p className="font-medium flex items-center gap-2">
                  <GoogleG /> Stash wants to access your {label}
                </p>
                <ul className="mt-2 text-ink-2 list-disc pl-5 space-y-1">
                  <li>See and download all your {label} files</li>
                </ul>
                <p className="mt-3 text-xs text-ink-3">Demo stand-in for Google&apos;s consent screen</p>
              </div>
            )}
            <div className="mt-5 flex gap-2 justify-end">
              <button className="btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn-primary py-3 text-base"
                data-testid="allow-google"
                onClick={() => {
                  setStep("progress");
                  onStart();
                }}
              >
                Allow
              </button>
            </div>
          </>
        )}

        {step === "progress" && (
          <>
            <h2 id="migrate-title" className="text-2xl font-semibold">
              {status.phase === "scanning" && (status.resume ? "Picking up where it left off" : "Reading your Drive")}
              {(status.phase === "copying" || status.phase === "waiting") && "Moving your files"}
              {status.phase === "done" && (left(status) === 0 ? "All moved." : "Almost all moved.")}
              {status.phase === "stopped" && "Copy stopped."}
              {status.phase === "reconnect" && `${label} needs your OK again`}
              {status.phase === "idle" && "Starting"}
            </h2>
            {status.phase === "scanning" && (
              <p className="mt-2 text-ink-2 flex items-center gap-2">
                <span className="inline-block size-4 rounded-full border-2 border-ink-3 border-t-ink animate-spin" aria-hidden />
                {label} lists files slowly. A large drive takes a few minutes.
              </p>
            )}
            {status.phase === "waiting" && <p className="mt-2 text-ink-2">{status.note}</p>}
            {status.phase === "reconnect" && <p className="mt-2 text-ink-2">{label} stopped letting Stash read your files. Allow it again and the copy carries on from here.</p>}
            {status.phase === "done" && left(status) > 0 && (
              <p className="mt-2 text-ink-2" data-testid="migrate-left">
                {left(status).toLocaleString()} {left(status) === 1 ? "file isn't" : "files aren't"} backed up yet. Resume tries them again.
              </p>
            )}
            {where === "server" && (status.phase === "copying" || status.phase === "waiting" || status.phase === "scanning") && (
              <p className="mt-2 text-sm text-ink-3">It runs on Stash&apos;s servers. You can close this tab or turn the computer off.</p>
            )}
            {status.phase !== "idle" && status.total !== undefined && (
              <p className="mt-2 text-ink-2" data-testid="scan-result">
                Found <strong>{status.total.toLocaleString()} files</strong> · {fmtBytes(status.bytes ?? 0)}
              </p>
            )}
            {status.phase !== "idle" && status.phase !== "scanning" && (status.skipped || status.failed) ? (
              <p className="mt-1 text-sm text-ink-3">
                {status.skipped ? `${status.skipped} too big to copy. ` : ""}
                {status.failed ? `${status.failed} couldn't be copied.` : ""}
              </p>
            ) : null}
            {(status.phase === "copying" || status.phase === "waiting" || status.phase === "done" || status.phase === "stopped" || status.phase === "reconnect") && (
              <>
                <div className="mt-4 h-3 rounded-full bg-cream-2 overflow-hidden">
                  <div className="h-full bg-accent transition-all duration-700" style={{ width: `${status.percent}%` }} />
                </div>
                <p className="mt-2 text-sm text-ink-2">
                  {status.copiedCount.toLocaleString()} of {status.total.toLocaleString()} · {status.percent}%
                </p>
              </>
            )}
            {real && onSwitchAccount && (
              <button className="mt-3 text-sm text-ink-3 hover:text-ink underline underline-offset-2" onClick={onSwitchAccount} data-testid="switch-google">
                Use a different Google account
              </button>
            )}
            <div className="mt-5 flex items-center justify-end gap-3">
              {(status.phase === "copying" || status.phase === "waiting" || status.phase === "scanning") && onStop && <IconButton label="Stop copy" onClick={onStop} icon="stop" testId="migrate-stop" />}
              {(status.phase === "stopped" || (status.phase === "done" && left(status) > 0)) && (
                <button className="btn-ghost border border-line py-3 text-base" onClick={onStart} data-testid="migrate-resume">
                  Resume back up
                </button>
              )}
              {status.phase === "reconnect" && onReconnect && (
                <button className="btn-ghost border border-line py-3 text-base" onClick={onReconnect} data-testid="migrate-reconnect">
                  Reconnect
                </button>
              )}
              <button className="btn-primary py-3 text-base" onClick={onClose} data-testid="migrate-close">
                {status.phase === "done" ? "See my files" : status.phase === "stopped" || status.phase === "reconnect" ? "Close" : "Keep working"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

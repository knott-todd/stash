"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "./AppHeader";
import { AskPasscode, ProtectionChoice, type Protection } from "./Protection";
import { getRawKey, recoveryCode, setRawKey, type WrappedKey } from "@/lib/crypto";
import { signOutEverywhereHere } from "@/lib/signout";
import { fmtBytes } from "@/lib/format";
import { exportAll, type ExportProgress } from "@/lib/export";
import type { FileRow } from "./Drive";

type Me = { signedIn: boolean; email?: string | null; name?: string | null; picture?: string | null; protection?: Protection; key?: string | null; keyWrapped?: WrappedKey | null; fileCount?: number; bytes?: number };

export function Settings() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [askPasscode, setAskPasscode] = useState(false);

  const load = useCallback(async () => {
    const m: Me = await fetch("/api/me").then((r) => r.json());
    if (!m.signedIn) return router.replace("/signin?next=/settings");
    if (m.key) setRawKey(m.key);
    setMe(m);
    setHasKey(!!getRawKey());
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const signOut = signOutEverywhereHere;

  if (!me) return null;
  const raw = getRawKey();

  return (
    <main className="flex-1 flex flex-col">
      <AppHeader active="settings" />

      <div className="mx-auto w-full max-w-3xl px-5 pb-24 flex-1">
        <h1 className="text-3xl font-semibold">Settings</h1>

        <section className="mt-8" aria-labelledby="account">
          <h2 id="account" className="text-xl font-semibold">
            Account
          </h2>
          <div className="card mt-3 p-5 flex flex-wrap items-center gap-4">
            {me.picture && <img src={me.picture} alt="" width={44} height={44} className="size-11 rounded-full" referrerPolicy="no-referrer" />}
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{me.name ?? me.email}</p>
              <p className="text-sm text-ink-2 truncate">{me.email}</p>
              <p className="text-sm text-ink-3">
                {(me.fileCount ?? 0).toLocaleString()} files · {fmtBytes(me.bytes ?? 0)}
              </p>
            </div>
            <button className="btn-ghost border border-line" onClick={signOut} data-testid="settings-signout">
              Sign out
            </button>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="protection">
          <h2 id="protection" className="text-xl font-semibold">
            How your files are protected
          </h2>
          <p className="mt-1 text-ink-2 text-sm">Every file is encrypted before it is stored either way. The difference is whether Stash can open your files for you, or only you can.</p>
          <div className="mt-4">
            {me.protection === "passcode" && !hasKey ? (
              <div className="card p-5">
                <p className="font-semibold">Your files are locked with a passcode.</p>
                <p className="mt-1 text-sm text-ink-2">Enter it to change this setting or see the recovery code.</p>
                <button className="btn-primary mt-3" onClick={() => setAskPasscode(true)}>
                  Enter passcode
                </button>
              </div>
            ) : (
              <ProtectionChoice
                current={me.protection ?? "standard"}
                onChanged={() => {
                  setShowRecovery(false);
                  load();
                }}
              />
            )}
          </div>
          {me.protection === "passcode" && hasKey && (
            <div className="mt-4 text-sm">
              <button className="text-ink-2 hover:text-ink underline underline-offset-4" onClick={() => setShowRecovery((s) => !s)}>
                {showRecovery ? "Hide recovery code" : "Show recovery code"}
              </button>
              {showRecovery && raw && (
                <code className="mt-2 block rounded-xl bg-cream-2 px-4 py-3 text-center text-lg tracking-wider font-mono select-all" data-testid="settings-recovery">
                  {recoveryCode(raw)}
                </code>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="mt-10 mx-auto w-full max-w-3xl px-5 pb-24" aria-labelledby="export">
        <h2 id="export" className="text-xl font-semibold">
          Take everything with you
        </h2>
        <p className="mt-1 text-ink-2 text-sm">One zip with every file, decrypted, in its folders. Your files are never locked in.</p>
        <div className="card mt-3 p-5">
          {me.protection === "passcode" && !hasKey ? (
            <p className="text-sm text-ink-2">Enter your passcode above first.</p>
          ) : (
            <ExportButton />
          )}
        </div>
      </section>

      {askPasscode && (
        <AskPasscode
          wrapped={me.keyWrapped ?? null}
          onCancel={() => setAskPasscode(false)}
          onUnlocked={() => {
            setAskPasscode(false);
            setHasKey(true);
          }}
        />
      )}
    </main>
  );
}

function ExportButton() {
  const [p, setP] = useState<ExportProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const files: FileRow[] = (await fetch("/api/files").then((r) => r.json())).files;
      await exportAll(files, setP);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setErr("The export didn't finish. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-4">
      <button className="btn-primary" onClick={run} disabled={busy} data-testid="export-all">
        {busy ? "Exporting" : "Export everything"}
      </button>
      {p && (
        <p className="text-sm text-ink-2" role="status">
          {p.done} of {p.total} · {fmtBytes(p.bytes)}
          {busy && p.name ? ` · ${p.name}` : ""}
          {!busy && p.failed.length ? ` · ${p.failed.length} couldn't be read` : ""}
          {!busy && p.done === p.total && !p.failed.length ? " · done" : ""}
        </p>
      )}
      {err && <p className="text-sm text-accent-ink">{err}</p>}
    </div>
  );
}

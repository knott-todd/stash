"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, HardDriveDownload, Shield, User } from "lucide-react";
import { AppHeader } from "./AppHeader";
import { AskPasscode, ProtectionChoice, type Protection } from "./Protection";
import { getRawKey, recoveryCode, setRawKey, type WrappedKey } from "@/lib/crypto";
import { signOutEverywhereHere } from "@/lib/signout";
import { fmtBytes } from "@/lib/format";
import { exportAll, type ExportProgress } from "@/lib/export";
import type { FileRow } from "./Drive";

// Settings as a list of rows that all read the same way: icon, title, one line,
// the control at the right. Four rows: account, protection, imports, export.

type Me = {
  signedIn: boolean;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  protection?: Protection;
  key?: string | null;
  keyWrapped?: WrappedKey | null;
  fileCount?: number;
  bytes?: number;
  googleConnected?: boolean;
  providers?: Record<"dropbox" | "onedrive", { enabled: boolean; connected: boolean }>;
};

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

  if (!me) return null;
  const raw = getRawKey();
  const imports = [
    { id: "google-drive", label: "Google Drive", connected: !!me.googleConnected, enabled: true, auth: "/api/google/auth?switch=1", disconnect: "/api/google" },
    { id: "dropbox", label: "Dropbox", connected: !!me.providers?.dropbox?.connected, enabled: !!me.providers?.dropbox?.enabled, auth: "/api/providers/dropbox/auth", disconnect: "/api/providers/dropbox/files" },
    { id: "onedrive", label: "OneDrive", connected: !!me.providers?.onedrive?.connected, enabled: !!me.providers?.onedrive?.enabled, auth: "/api/providers/onedrive/auth", disconnect: "/api/providers/onedrive/files" },
  ].filter((p) => p.enabled);

  return (
    <main className="flex-1 flex flex-col">
      <AppHeader active="settings" />

      <div className="mx-auto w-full max-w-3xl px-5 pb-24 flex-1">
        <h1 className="text-3xl font-semibold">Settings</h1>

        <div className="mt-6 card divide-y divide-line">
          <Row icon={<User size={22} strokeWidth={1.6} />} title={me.name ?? me.email ?? "Your account"} line={`${me.email ?? ""} · ${(me.fileCount ?? 0).toLocaleString()} files · ${fmtBytes(me.bytes ?? 0)}`}>
            <button className="btn-ghost border border-line text-sm py-2" onClick={() => signOutEverywhereHere()} data-testid="settings-signout">
              Sign out
            </button>
          </Row>

          <Row icon={<Shield size={22} strokeWidth={1.6} />} title="How your files are protected" line="Encrypted before they are stored either way. The difference is whether Stash can open them for you, or only you can." full>
            {me.protection === "passcode" && !hasKey ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-ink-2">Your files are locked. Enter the passcode to change this or see the recovery code.</p>
                <button className="btn-ghost border border-line text-sm py-2" onClick={() => setAskPasscode(true)}>
                  Enter passcode
                </button>
              </div>
            ) : (
              <>
                <ProtectionChoice
                  current={me.protection ?? "standard"}
                  onChanged={() => {
                    setShowRecovery(false);
                    load();
                  }}
                />
                {me.protection === "passcode" && hasKey && (
                  <div className="mt-3 text-sm">
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
              </>
            )}
          </Row>

          <Row icon={<HardDriveDownload size={22} strokeWidth={1.6} />} title="Imports" line="Where files were moved from. Nothing is deleted at the other end." full>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {imports.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span>
                    <span className="font-medium">{p.label}</span>
                    <span className="ml-2 text-ink-3">{p.connected ? "Connected" : "Not connected"}</span>
                  </span>
                  <span className="flex gap-3">
                    <a className="underline underline-offset-4 text-ink-2 hover:text-ink" href={p.auth}>
                      {p.connected ? "Move again" : "Connect"}
                    </a>
                    {p.connected && (
                      <button
                        className="underline underline-offset-4 text-ink-3 hover:text-ink"
                        onClick={async () => {
                          await fetch(p.disconnect, { method: "DELETE" });
                          load();
                        }}
                      >
                        Disconnect
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Row>

          <Row icon={<Download size={22} strokeWidth={1.6} />} title="Take everything with you" line="One zip with every file, readable, in its folders.">
            {me.protection === "passcode" && !hasKey ? <span className="text-sm text-ink-3">Enter your passcode first.</span> : <ExportButton />}
          </Row>
        </div>
      </div>

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

// icon · title · one line · control. `full` puts the control under the text, full width.
function Row({ icon, title, line, full = false, children }: { icon: React.ReactNode; title: string; line: string; full?: boolean; children: React.ReactNode }) {
  return (
    <section className="p-5 flex gap-4">
      <span className="mt-0.5 shrink-0 text-ink-2" aria-hidden>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className={`flex ${full ? "flex-col gap-3" : "flex-wrap items-center justify-between gap-3"}`}>
          <div className="min-w-0">
            <h2 className="font-semibold truncate">{title}</h2>
            <p className="text-sm text-ink-2">{line}</p>
          </div>
          <div className={full ? "" : "shrink-0"}>{children}</div>
        </div>
      </div>
    </section>
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
    <div className="flex flex-wrap items-center gap-3">
      {p && (
        <span className="text-sm text-ink-2" role="status">
          {p.done} of {p.total} · {fmtBytes(p.bytes)}
          {!busy && p.done === p.total && !p.failed.length ? " · done" : ""}
          {!busy && p.failed.length ? ` · ${p.failed.length} couldn't be read` : ""}
        </span>
      )}
      {err && <span className="text-sm text-accent-ink">{err}</span>}
      <button className="btn-ghost border border-line text-sm py-2" onClick={run} disabled={busy} data-testid="export-all">
        {busy ? "Exporting" : "Export"}
      </button>
    </div>
  );
}

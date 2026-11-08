"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "./Logo";
import { fmtBytes, fmtDate } from "@/lib/format";
import { STAGING } from "@/lib/stage";

// Every device that sends files to this account, what each is doing, and how
// to add one. The point of the page: you can see that the backup is automatic.

type Folder = { path: string; label: string; files: number; bytes: number; pending: number; failed: number; lastUpload?: number };
type Device = {
  id: string;
  name: string;
  platform: string;
  kind: "desktop" | "phone";
  createdAt: number;
  lastSeen: number;
  files: number;
  bytes: number;
  state: { status: "idle" | "scanning" | "uploading" | "paused" | "error"; detail?: string; folders: Folder[]; version?: string; updatedAt: number } | null;
};

const ago = (t: number, now: number) => {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDate(t);
};

export function Devices() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [phoneFiles, setPhoneFiles] = useState(0);
  const [origin, setOrigin] = useState("");
  const [now, setNow] = useState(0); // taken when the list loads, so rendering stays pure

  const load = useCallback(async () => {
    const r = await fetch("/api/devices");
    if (r.status === 401) return router.replace("/signin?next=/devices");
    const j = await r.json();
    setNow(Date.now());
    setDevices(j.devices);
    setPhoneFiles(j.phoneFiles);
  }, [router]);

  useEffect(() => {
    setOrigin(location.origin); // eslint-disable-line react-hooks/set-state-in-effect -- window only exists after mount
    load();
    const t = setInterval(load, 10000); // devices report every minute or so; keep the page honest
    return () => clearInterval(t);
  }, [load]);

  async function unlink(d: Device) {
    if (!confirm(`Unlink ${d.name}? It stops sending files. Everything it already sent stays here.`)) return;
    await fetch(`/api/devices/${d.id}`, { method: "DELETE" });
    load();
  }

  async function rename(d: Device) {
    const name = prompt("Name this device", d.name);
    if (!name || name === d.name) return;
    await fetch(`/api/devices/${d.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    load();
  }

  const computers = devices?.filter((d) => d.kind === "desktop") ?? [];

  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-5xl px-5 py-5 flex items-center justify-between gap-4">
        <Logo />
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/drive" className="text-ink-2 hover:text-ink underline-offset-4 hover:underline">
            My drive
          </Link>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-5xl px-5 pb-24 flex-1">
        <h1 className="text-3xl font-semibold">Devices</h1>
        <p className="mt-2 text-ink-2 max-w-2xl">
          Each device backs itself up to this account on its own. This page shows what every one of them is doing, so you never have to wonder.
        </p>

        <section className="mt-8" aria-labelledby="computers">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="computers" className="text-xl font-semibold">
              Computers
            </h2>
          </div>
          {devices === null && <p className="mt-3 text-ink-3">Loading</p>}
          {devices && computers.length === 0 && (
            <div className="card mt-3 p-5">
              <p className="font-semibold">No computer is backing up yet.</p>
              <p className="mt-1 text-ink-2">Stash Desktop watches the folders you choose and sends every new or changed file here, encrypted, without you doing anything.</p>
              {STAGING ? <AddComputer origin={origin} /> : <p className="mt-3 text-sm text-ink-3">Stash Desktop is on its way. It installs like any other app; you pick the folders once and it does the rest.</p>}
            </div>
          )}
          <ul className="mt-3 grid gap-3">
            {computers.map((d) => (
              <li key={d.id} className="card p-5" data-testid="device">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{d.name}</p>
                    <p className="text-sm text-ink-2">
                      <StatusDot d={d} stale={now - d.lastSeen > 5 * 60 * 1000} /> <StatusText d={d} stale={now - d.lastSeen > 5 * 60 * 1000} />
                    </p>
                  </div>
                  <p className="text-sm text-ink-2 text-right">
                    {d.files.toLocaleString()} files · {fmtBytes(d.bytes)}
                    <br />
                    <span className="text-ink-3">Last seen {ago(d.lastSeen, now)}</span>
                  </p>
                </div>
                {d.state?.folders.length ? (
                  <ul className="mt-4 divide-y divide-line border-t border-line">
                    {d.state.folders.map((f) => (
                      <li key={f.path} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium">{f.label || f.path}</span>
                          <span className="block text-ink-3 truncate max-w-md" title={f.path}>
                            {f.path}
                          </span>
                        </span>
                        <span className="text-ink-2 text-right">
                          {f.files.toLocaleString()} files · {fmtBytes(f.bytes)}
                          {f.pending > 0 && <span className="block text-ink">{f.pending.toLocaleString()} waiting</span>}
                          {f.failed > 0 && <span className="block text-accent-ink">{f.failed.toLocaleString()} couldn&apos;t be sent</span>}
                          {f.pending === 0 && f.lastUpload ? <span className="block text-ink-3">Up to date · last file {ago(f.lastUpload, now)}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-ink-3">No folders chosen yet. Pick them in Stash Desktop on that computer.</p>
                )}
                <div className="mt-4 flex gap-4 text-sm">
                  <button className="text-ink-2 hover:text-ink underline-offset-4 hover:underline" onClick={() => rename(d)}>
                    Rename
                  </button>
                  <button className="text-ink-3 hover:text-ink underline-offset-4 hover:underline" onClick={() => unlink(d)}>
                    Unlink
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {devices && computers.length > 0 && STAGING && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-ink-2 hover:text-ink">Add another computer</summary>
              <div className="card mt-2 p-5">
                <AddComputer origin={origin} />
              </div>
            </details>
          )}
        </section>

        <section className="mt-10" aria-labelledby="phones">
          <h2 id="phones" className="text-xl font-semibold">
            Phone
          </h2>
          <div className="card mt-3 p-5">
            {phoneFiles > 0 ? (
              <p className="font-semibold">{phoneFiles.toLocaleString()} photos and videos have come from your phone.</p>
            ) : (
              <p className="font-semibold">No phone photos yet.</p>
            )}
            <p className="mt-1 text-ink-2">
              On your phone, open <span className="font-semibold text-ink">{origin.replace(/^https?:\/\//, "") || "stash"}</span>, sign in with the same Google account, and tap{" "}
              <span className="font-semibold text-ink">Back up photos</span>. Automatic backup from a phone needs the Stash app, which is next on the list.
            </p>
            <Link href="/m" className="btn-ghost mt-3 px-0 pointer-coarse:inline-flex hidden">
              Back up this phone&apos;s photos
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusDot({ d, stale }: { d: Device; stale: boolean }) {
  const color = stale ? "bg-ink-3" : d.state?.status === "error" ? "bg-accent-ink" : d.state?.status === "uploading" || d.state?.status === "scanning" ? "bg-ink" : "bg-ok";
  return <span className={`inline-block size-2 rounded-full align-middle ${color}`} aria-hidden />;
}

function StatusText({ d, stale }: { d: Device; stale: boolean }) {
  if (stale) return <>Not running right now. It carries on when the computer is back.</>;
  const s = d.state;
  if (!s) return <>Linked. Waiting for its first report.</>;
  if (s.status === "uploading") return <>Backing up{s.detail ? `: ${s.detail}` : ""}</>;
  if (s.status === "scanning") return <>Looking for new files</>;
  if (s.status === "paused") return <>Paused on that computer</>;
  if (s.status === "error") return <>Trouble: {s.detail ?? "see Stash Desktop"}</>;
  const pending = s.folders.reduce((n, f) => n + f.pending, 0);
  return pending ? <>{pending.toLocaleString()} files waiting</> : <>Up to date. Watching for changes.</>;
}

function AddComputer({ origin }: { origin: string }) {
  const server = origin && !/localhost/.test(origin) ? ` --server ${origin}` : "";
  return (
    <div className="mt-3 text-sm">
      <ol className="list-decimal pl-5 space-y-1.5 text-ink-2">
        <li>
          On that computer, install Node.js if it isn&apos;t there (<a className="underline" href="https://nodejs.org" target="_blank" rel="noreferrer">nodejs.org</a>).
        </li>
        <li>
          <a className="underline" href="https://github.com/knott-todd/stash/archive/refs/heads/main.zip">Download Stash</a> and unzip it.
        </li>
        <li>
          Open a terminal in the unzipped folder and run:
          <code className="block mt-1.5 rounded-lg bg-cream-2 px-3 py-2 text-ink select-all">node desktop/cli.mjs{server}</code>
        </li>
        <li>It shows a code and opens the link page here; approve it.</li>
        <li>Choose the folders to keep backed up. Documents and Pictures are suggested. Leave it running.</li>
      </ol>
      <p className="mt-2 text-ink-3">
        To have it start with the computer: <code className="rounded bg-cream-2 px-1.5 py-0.5 text-ink">node desktop/cli.mjs --install-startup</code>. An installer with no terminal is coming; this is the developer preview.
      </p>
    </div>
  );
}

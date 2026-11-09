"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Laptop, Link2Off, Pencil, Plus, Smartphone, X } from "lucide-react";
import { AppHeader } from "./AppHeader";
import { fmtBytes, fmtDate } from "@/lib/format";

// One list of devices, whatever they are. Each card: what it is, what it keeps
// backed up (indented), and whether it is up to date. The one action that is
// always there: Link a device.

type Folder = { path: string; label: string; files: number; bytes: number; pending: number; failed: number; lastUpload?: number };
export type Device = {
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
  const [now, setNow] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/devices");
    if (r.status === 401) return router.replace("/signin?next=/devices");
    const j = await r.json();
    setNow(Date.now());
    setDevices(j.devices);
    setPhoneFiles(j.phoneFiles);
  }, [router]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function unlink(d: Device) {
    if (!confirm(`Unlink ${d.name}? It stops backing up. Everything it already sent stays here.`)) return;
    await fetch(`/api/devices/${d.id}`, { method: "DELETE" });
    load();
  }

  async function rename(d: Device) {
    const n = name.trim();
    setEditing(null);
    if (!n || n === d.name) return;
    await fetch(`/api/devices/${d.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: n }) });
    load();
  }

  // The phone has no app yet; its photos still count as a device so the list is one list.
  const list: Device[] = [
    ...(devices ?? []),
    ...(phoneFiles > 0 && !(devices ?? []).some((d) => d.kind === "phone")
      ? [{ id: "phone-web", name: "Your phone", platform: "phone", kind: "phone" as const, createdAt: 0, lastSeen: now, files: phoneFiles, bytes: 0, state: null }]
      : []),
  ];

  return (
    <main className="flex-1 flex flex-col">
      <AppHeader active="devices" />

      <div className="mx-auto w-full max-w-5xl px-5 pb-24 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold">Devices</h1>
          <Link href="/devices/add" className="btn-primary text-sm py-2.5 inline-flex items-center gap-2" data-testid="link-device">
            <Plus size={16} /> Link a device
          </Link>
        </div>
        {devices !== null && list.length === 0 && <p className="mt-2 text-ink-2">Link a device and choose what it keeps backed up. From then on it runs itself.</p>}

        <ul className="mt-6 grid gap-3" data-testid="device-list">
          {list.map((d) => {
            const stale = d.id !== "phone-web" && now - d.lastSeen > 5 * 60 * 1000;
            const sources = d.id === "phone-web" ? [{ path: "Camera roll", label: "Camera roll", files: d.files, bytes: 0, pending: 0, failed: 0 }] : (d.state?.folders ?? []);
            return (
              <li key={d.id} className="card p-5" data-testid="device">
                <div className="flex items-start gap-4">
                  <span className="mt-0.5 shrink-0 text-ink-2" aria-hidden>
                    {d.kind === "phone" ? <Smartphone size={26} strokeWidth={1.5} /> : <Laptop size={26} strokeWidth={1.5} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {editing === d.id ? (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            rename(d);
                          }}
                        >
                          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => rename(d)} onKeyDown={(e) => e.key === "Escape" && setEditing(null)} className="rounded-lg border border-ink bg-white px-2 py-1 text-lg font-semibold outline-none" aria-label="Device name" />
                          <button type="submit" className="text-ink-2 hover:text-ink" aria-label="Save name">
                            <Check size={18} />
                          </button>
                          <button type="button" className="text-ink-3 hover:text-ink" onClick={() => setEditing(null)} aria-label="Cancel">
                            <X size={18} />
                          </button>
                        </form>
                      ) : (
                        <>
                          <p className="text-lg font-semibold truncate">{d.name}</p>
                          {d.id !== "phone-web" && (
                            <button
                              className="text-ink-3 hover:text-ink"
                              onClick={() => {
                                setName(d.name);
                                setEditing(d.id);
                              }}
                              aria-label={`Rename ${d.name}`}
                              data-testid="rename-device"
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                        </>
                      )}
                      <span className="ml-auto text-sm text-ink-2 whitespace-nowrap">
                        {d.files.toLocaleString()} files{d.bytes ? ` · ${fmtBytes(d.bytes)}` : ""}
                      </span>
                      {d.id !== "phone-web" && (
                        <button className="text-ink-3 hover:text-ink" onClick={() => unlink(d)} aria-label={`Unlink ${d.name}`} title="Unlink" data-testid="unlink-device">
                          <Link2Off size={17} />
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-2 flex items-center gap-2">
                      <StatusDot d={d} stale={stale} />
                      <StatusText d={d} stale={stale} now={now} />
                    </p>

                    {sources.length > 0 ? (
                      <ul className="mt-3 ml-1 border-l-2 border-line pl-4 divide-y divide-line">
                        {sources.map((f) => (
                          <li key={f.path} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="min-w-0">
                              <span className="font-medium">{f.label || f.path}</span>
                              {f.path !== f.label && (
                                <span className="block text-xs text-ink-3 truncate max-w-md" title={f.path}>
                                  {f.path}
                                </span>
                              )}
                            </span>
                            <span className="text-ink-2 text-right text-xs">
                              {f.files.toLocaleString()} files{f.bytes ? ` · ${fmtBytes(f.bytes)}` : ""}
                              {f.pending > 0 && <span className="block text-ink">{f.pending.toLocaleString()} waiting</span>}
                              {f.failed > 0 && <span className="block text-accent-ink">{f.failed.toLocaleString()} couldn&apos;t be sent</span>}
                              {f.pending === 0 && f.lastUpload ? <span className="block text-ink-3">last file {ago(f.lastUpload, now)}</span> : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 ml-1 border-l-2 border-line pl-4 text-sm text-ink-3">Nothing chosen yet. Pick folders in Stash on that device.</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}

function StatusDot({ d, stale }: { d: Device; stale: boolean }) {
  const color = stale ? "bg-ink-3" : d.state?.status === "error" ? "bg-accent-ink" : d.state?.status === "uploading" || d.state?.status === "scanning" ? "bg-ink" : "bg-ok";
  return <span className={`inline-block size-2 rounded-full shrink-0 ${color}`} aria-hidden />;
}

function StatusText({ d, stale, now }: { d: Device; stale: boolean; now: number }) {
  if (d.id === "phone-web") return <>Photos you picked on your phone. Automatic backup from a phone needs the Stash app, which is next.</>;
  if (stale) return <>Not running right now · last seen {ago(d.lastSeen, now)}</>;
  const s = d.state;
  if (!s) return <>Linked. Waiting for its first report.</>;
  if (s.status === "uploading") return <>Backing up{s.detail ? `: ${s.detail}` : ""}</>;
  if (s.status === "scanning") return <>Looking for new files</>;
  if (s.status === "paused") return <>Paused on that device</>;
  if (s.status === "error") return <>Needs attention: {s.detail ?? "open Stash on that device"}</>;
  const pending = s.folders.reduce((n, f) => n + f.pending, 0);
  return pending ? <>{pending.toLocaleString()} files waiting</> : <>Up to date · last seen {ago(d.lastSeen, now)}</>;
}

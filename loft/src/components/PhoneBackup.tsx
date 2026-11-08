"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Logo } from "./Logo";
import { PhoneBackupDemo } from "./PhoneBackupDemo";
import { adoptKeyFromFragment } from "@/lib/crypto";
import { fingerprint, MAX_BYTES, uploadEncrypted } from "@/lib/upload";

const HISTORY_KEY = "loft_photos_v1";
const FOLDER = "Phone photos";
const PARALLEL = 2;

type History = { fps: string[]; last: number };
type ItemState = "waiting" | "uploading" | "done" | "skipped" | "error";
type Item = { key: string; file: File; url: string; state: ItemState; error?: string };

function loadHistory(): History {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "") as History;
  } catch {
    return { fps: [], last: 0 };
  }
}
function saveHistory(h: History) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {}
}

// Phone-first screen. A web page can't read the camera roll on its own, so the
// system picker does it, and photos already backed up are skipped. Each photo is
// encrypted on the phone before upload, same as the drive.
export function PhoneBackup() {
  const params = useSearchParams();
  if (params.get("demo") === "1") return <PhoneBackupDemo />;
  return <RealBackup />;
}

function RealBackup() {
  const [items, setItems] = useState<Item[]>([]);
  const [history, setHistory] = useState<History>({ fps: [], last: 0 });
  const [paired, setPaired] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    // Arrived by QR from a laptop? Adopt that drive and its key, then carry on.
    adoptKeyFromFragment();
    const t = new URLSearchParams(location.search).get("t");
    if (t) fetch(`/api/claim?t=${encodeURIComponent(t)}`).then(() => setPaired(true));
    setHistory(loadHistory()); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage only exists after mount
    const made = urls.current;
    return () => made.forEach(URL.revokeObjectURL);
  }, []);

  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function backUp(list: Item[]) {
    const queue = [...list];
    const seen = new Set(loadHistory().fps);
    async function worker() {
      for (let it = queue.shift(); it; it = queue.shift()) {
        if (it.file.size > MAX_BYTES) {
          patch(it.key, { state: "error", error: "Over 50 MB" });
          continue;
        }
        patch(it.key, { state: "uploading" });
        try {
          const fp = await fingerprint(it.file);
          if (seen.has(fp)) {
            patch(it.key, { state: "skipped" });
            continue;
          }
          await uploadEncrypted(named(it.file, fp), { folder: FOLDER, source: "phone" });
          seen.add(fp);
          const h = { fps: [...seen], last: Date.now() };
          saveHistory(h);
          setHistory(h);
          patch(it.key, { state: "done" });
        } catch {
          patch(it.key, { state: "error", error: "Didn't upload" });
        }
      }
    }
    await Promise.all(Array.from({ length: PARALLEL }, worker));
  }

  function picked(files: FileList | null) {
    if (!files?.length) return;
    const next = Array.from(files, (file, i) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      return { key: `${Date.now()}-${i}`, file, url, state: "waiting" as const };
    });
    setItems(next);
    backUp(next);
  }

  function retry() {
    const failed = items.filter((x) => x.state === "error" && x.file.size <= MAX_BYTES);
    failed.forEach((x) => patch(x.key, { state: "waiting", error: undefined }));
    backUp(failed);
  }

  const n = (s: ItemState) => items.filter((x) => x.state === s).length;
  const finished = n("done") + n("skipped") + n("error");
  const running = items.length > 0 && finished < items.length;
  const failed = n("error");
  const retryable = items.some((x) => x.state === "error" && x.file.size <= MAX_BYTES);
  const returning = history.fps.length > 0;

  return (
    <main className="flex-1 flex flex-col mx-auto w-full max-w-md">
      <header className="px-5 py-5 flex items-center justify-between">
        <Logo />
        <Link href="/drive" className="text-sm text-ink-2 hover:text-ink">
          My drive →
        </Link>
      </header>

      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          picked(e.target.files);
          e.target.value = "";
        }}
        data-testid="photo-input"
      />

      <section className="px-5 pb-4">
        {items.length === 0 ? (
          <>
            {paired && (
              <p className="rise mb-3 inline-flex items-center gap-2 rounded-full bg-ok-soft text-ok px-3 py-1 text-sm font-medium" role="status">
                Linked to your drive
              </p>
            )}
            {returning ? (
              <>
                <h1 className="rise text-4xl font-semibold text-balance">Welcome back.</h1>
                <p className="rise-2 mt-2 text-ink-2">
                  {history.fps.length} {history.fps.length === 1 ? "photo" : "photos"} backed up
                  {history.last ? `, last on ${new Date(history.last).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : ""}.
                </p>
              </>
            ) : (
              <>
                <h1 className="rise text-4xl font-semibold text-balance">Never lose a photo again.</h1>
                <p className="rise-2 mt-2 text-ink-2">Pick your photos. Each one is encrypted on this phone before it leaves.</p>
              </>
            )}
            <button className="btn-primary rise-3 mt-6 w-full" onClick={() => input.current?.click()} data-testid="backup-photos">
              {returning ? "Back up new photos" : "Back up my photos"}
            </button>
            <p className="mt-3 text-center text-sm text-ink-3">
              {returning ? "Select them all. Ones already backed up are skipped." : "Your phone will ask which photos to share."}
            </p>
          </>
        ) : (
          <div className="card p-4" role="status" aria-live="polite" data-testid="backup-status">
            <div className="flex items-center justify-between">
              <p className="font-semibold">
                {running ? "Backing up…" : failed ? `${failed} didn't back up.` : "All backed up."}
              </p>
              <p className="text-sm text-ink-2">
                {finished} of {items.length}
              </p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-cream-2 overflow-hidden">
              <div className="h-full bg-ok transition-all duration-500" style={{ width: `${(finished / items.length) * 100}%` }} />
            </div>
            <p className="mt-2 text-sm text-ink-2">
              {running
                ? "Keep this page open until it finishes."
                : failed
                ? `${n("done") ? `${n("done")} backed up. ` : ""}Check your connection, then try again.`
                : `${n("done")} new ${n("done") === 1 ? "photo" : "photos"} safe in your drive.${n("skipped") ? ` ${n("skipped")} were already backed up.` : ""} Open Loft to back up new ones.`}
            </p>
            {!running && (
              <div className="mt-3 flex gap-2">
                {retryable && (
                  <button className="btn-primary flex-1" onClick={retry} data-testid="backup-retry">
                    Try again
                  </button>
                )}
                <button className="btn-ghost flex-1 border border-line" onClick={() => input.current?.click()}>
                  Back up more
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {items.length > 0 && (
        <section className="px-3 pb-10 grid grid-cols-3 gap-1.5" aria-label="Photos in this backup">
          {items.map((it) => (
            <div key={it.key} className="relative aspect-square rounded-xl overflow-hidden bg-cream-2" aria-label={`${it.file.name}: ${label(it)}`}>
              {it.file.type.startsWith("image/") ? (
                <img src={it.url} alt="" className={`size-full object-cover ${it.state === "uploading" || it.state === "waiting" ? "opacity-60" : ""}`} />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-xs text-ink-3">Video</span>
              )}
              {(it.state === "done" || it.state === "skipped") && (
                <span className="absolute bottom-1.5 right-1.5 size-5 rounded-full bg-ok text-white text-xs flex items-center justify-center shadow">✓</span>
              )}
              {it.state === "error" && (
                <span className="absolute inset-x-1 bottom-1 rounded-md bg-ink/80 text-white text-[11px] px-1.5 py-0.5 text-center">{it.error}</span>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

// iOS hands over picked photos as "image.jpg"; give them a name worth reading in the drive.
function named(file: File, fp: string) {
  const m = file.name.match(/^(image|video)(\.\w+)?$/i);
  if (!m) return file;
  const d = new Date(file.lastModified || Date.now());
  const p = (x: number) => String(x).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
  return new File([file], `${m[1] === "video" ? "Video" : "Photo"} ${stamp} ${fp.slice(0, 4)}${m[2] ?? ""}`, { type: file.type });
}

function label(it: Item) {
  return { waiting: "Waiting", uploading: "Backing up", done: "Backed up", skipped: "Already backed up", error: it.error ?? "Didn't upload" }[it.state];
}

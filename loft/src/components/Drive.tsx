"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileBrowser } from "./FileBrowser";
import { Logo } from "./Logo";
import { MigrateDialog, type MigrationStatus } from "./MigrateDialog";
import { PairCard } from "./PairCard";
import { fmtBytes } from "@/lib/format";
import { clearRawKey, decryptFile, getRawKey, setRawKey, type WrappedKey } from "@/lib/crypto";
import { AskPasscode, ProtectionChoice } from "./Protection";
import { rememberAccount } from "@/lib/accounts";
import Link from "next/link";
import { runGoogleCopy, type CopyEvent } from "@/lib/gdrive-client";
import { cacheClear, cacheGet, cacheHas, cachePut } from "@/lib/filecache";
import { viewableMime } from "@/lib/view";
import { demoMode } from "@/lib/demo-flag";
import { uploadEncrypted, uploadMode } from "@/lib/upload";

export type FileRow = {
  id: string;
  name: string;
  size: number;
  mime: string;
  folder: string;
  source: "upload" | "google-drive" | "phone" | "desktop";
  createdAt: number;
  encrypted: boolean;
  chunked: boolean;
  thumb: boolean;
  modifiedAt: number | null;
  deviceId: string | null;
  stored: boolean;
};


type Me = {
  signedIn: boolean;
  demo: boolean;
  google: boolean;
  googleConnected: boolean;
  fileCount: number;
  bytes: number;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  key?: string | null;
  protection?: "standard" | "passcode" | null;
  keyWrapped?: WrappedKey | null;
  legacy?: { fileCount: number } | null;
};

const DISMISS_KEY = "stash_pair_dismissed";

export function Drive() {
  const params = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [files, setFiles] = useState<FileRow[] | null>(null);
  // The folder lives in the URL so Back works and a folder can be linked to.
  const router = useRouter();
  const folder = params.get("folder") ?? "";
  const setFolder = useCallback(
    (p: string) => router.push(p ? `/drive?folder=${encodeURIComponent(p)}` : "/drive", { scroll: false }),
    [router],
  );
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [migration, setMigration] = useState<MigrationStatus>({ phase: "idle" });
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; retry?: () => void; undo?: () => void } | null>(null);
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pairOpen, setPairOpen] = useState<"card" | "qr" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const demoTools = demoMode(params);
  // Locked account on a device without the key: ask for the passcode before anything else.
  const [needPasscode, setNeedPasscode] = useState(false);
  // First sign-in: choose how the files are protected.
  const [chooseProtection, setChooseProtection] = useState(false);

  const refresh = useCallback(async () => {
    const [m, f] = await Promise.all([fetch("/api/me").then((r) => r.json()), fetch("/api/files").then((r) => r.json())]);
    setMe(m);
    setFiles(f.files);
    return m as Me;
  }, []);

  useEffect(() => {
    refresh().then(async (m) => {
      // Not signed in: the sign-in page, then back here.
      if (!m.signedIn) return router.replace("/signin?next=" + encodeURIComponent(location.pathname + location.search));
      if (m.email) rememberAccount({ email: m.email, name: m.name, picture: m.picture });
      // A device from before accounts holds a drive of its own: fold it into this
      // account (its files and its key) the first time, if the account is empty.
      if (m.legacy && m.legacy.fileCount > 0 && getRawKey()) {
        const r = await fetch("/api/auth/adopt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: getRawKey() }) })
          .then((x) => x.json())
          .catch(() => null);
        if (r?.moved) {
          setToast({ text: `Your ${r.moved} files from this device are now in your account.` });
          const m2 = await refresh();
          if (m2.key) setRawKey(m2.key);
          return;
        }
      }
      // The account key opens the files on this device.
      if (m.key) setRawKey(m.key);
      if (m.protection === "passcode" && !getRawKey()) setNeedPasscode(true);
      if (!m.protection) setChooseProtection(true);
      // Simulated migration status only applies when Google isn't configured.
      if (!m.google)
        fetch("/api/migrate")
          .then((r) => r.json())
          .then(setMigration)
          .catch(() => {});
    });
  }, [refresh, router]);

  // Real Google flow: back from consent → list, copy in the browser, resume if interrupted.
  const googleFlag = params.get("google");
  const realGoogle = !!me?.google;
  const copyStarted = useRef(false);
  const copyCtrl = useRef<AbortController | null>(null);
  // What the copy is doing right now: action, file, where from, where to.
  const [activity, setActivity] = useState<CopyEvent | null>(null);
  const logEvent = useCallback((e: CopyEvent) => setActivity(e), []);
  const startGoogleCopy = useCallback(() => {
    copyCtrl.current?.abort();
    const ctrl = new AbortController();
    copyCtrl.current = ctrl;
    runGoogleCopy(setMigration, refresh, ctrl.signal, logEvent).catch(() => {
      if (!ctrl.signal.aborted) setToast({ text: "Google stopped answering. The copy resumes when you reopen Stash.", retry: () => location.reload() });
    });
  }, [refresh, logEvent]);
  const stopGoogleCopy = () => copyCtrl.current?.abort();

  useEffect(() => {
    if (!realGoogle || copyStarted.current) return;
    if (googleFlag === "denied") setToast({ text: "Google didn't allow access. Try again or add files yourself." });
    if (googleFlag === "failed") setToast({ text: "Couldn't connect to Google. Try again.", retry: () => (location.href = "/api/google/auth") });
    const resuming = !!me?.googleConnected && !!localStorage.getItem("stash_gd_done_v1");
    if (googleFlag !== "ok" && !resuming) return;
    copyStarted.current = true;
    setMigrateOpen(googleFlag === "ok");
    startGoogleCopy();
    return () => copyCtrl.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realGoogle, googleFlag]);

  // Which files have a local copy (ciphertext in the browser cache).
  const [local, setLocal] = useState<Set<string>>(new Set());
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    if (!files) return;
    cacheHas(files.map((f) => f.id)).then(setLocal);
  }, [files]);

  useEffect(() => {
    if (realGoogle) return;
    if (migration.phase !== "copying" && migration.phase !== "scanning") return;
    const t = setInterval(async () => {
      const s: MigrationStatus = await fetch("/api/migrate").then((r) => r.json());
      setMigration(s);
      if (s.phase === "copying" || s.phase === "done") refresh();
    }, 1000);
    return () => clearInterval(t);
  }, [migration.phase, refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.retry ? 10000 : toast.undo ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function startMigration() {
    if (realGoogle) {
      // Resume after a stop; otherwise real consent lives on Google's screen.
      if (migration.phase === "stopped") return startGoogleCopy();
      location.href = "/api/google/auth";
      return;
    }
    setMigration(await fetch("/api/migrate", { method: "POST" }).then((r) => r.json()));
  }

  // Encrypt in the browser, then upload ciphertext with the original name and type.
  async function uploadOne(file: File) {
    const { maxBytes } = await uploadMode();
    if (file.size > maxBytes) {
      setToast({ text: `${file.name} is over ${Math.round(maxBytes / 1024 / 1024)} MB. Files that big aren't supported yet.` });
      return;
    }
    setBusy(file.name);
    try {
      await uploadEncrypted(file, { folder });
      const first = (files?.length ?? 0) === 0;
      setToast({ text: "Safe. Encrypted on this device before it left." });
      await refresh();
      if (first && !localStorage.getItem(DISMISS_KEY)) setPairOpen("card");
    } catch (e) {
      // Server messages ("Storage is busy…", size limits) are written for users; show them as-is.
      const msg = e instanceof Error && e.message && !/^(upload-failed|too-big)$/.test(e.message) ? e.message : `Couldn't upload ${file.name}. Check your connection.`;
      setToast({ text: msg, retry: () => uploadOne(file) });
    } finally {
      setBusy(null);
    }
  }

  async function upload(list: FileList | File[]) {
    for (const f of Array.from(list)) await uploadOne(f);
  }

  function addSample() {
    const text = `Welcome to Stash.\n\nThis file was encrypted on your device before upload.\nLoft only ever holds the scrambled version.\nAdded ${new Date().toLocaleString()}.\n`;
    return uploadOne(new File([text], "Welcome to Stash.txt", { type: "text/plain" }));
  }

  async function rename(f: FileRow, name: string) {
    setFiles((fs) => fs && fs.map((x) => (x.id === f.id ? { ...x, name } : x)));
    const r = await fetch(`/api/files/${f.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    if (!r.ok) setToast({ text: `Couldn't rename ${f.name}.` });
    refresh();
  }

  // Trash is optimistic with Undo; the server delete happens when the toast expires.
  const pendingTrash = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  function trash(f: FileRow) {
    setFiles((fs) => fs && fs.filter((x) => x.id !== f.id));
    const t = setTimeout(async () => {
      pendingTrash.current.delete(f.id);
      const r = await fetch(`/api/files/${f.id}`, { method: "DELETE" });
      if (!r.ok) {
        setToast({ text: `Couldn't delete ${f.name}.` });
        refresh();
      }
    }, 6000);
    pendingTrash.current.set(f.id, t);
    setToast({
      text: `${f.name} moved to trash.`,
      undo: () => {
        clearTimeout(t);
        pendingTrash.current.delete(f.id);
        setToast(null);
        refresh();
      },
    });
  }

  // Fetch ciphertext, decrypt here, hand the browser a real file.
  async function open(f: FileRow, forceDownload = false) {
    if (!f.stored) {
      setToast({ text: "This row is a placeholder from the demo migration. Add a file to try Open." });
      return;
    }
    // Viewable files open in a tab. The tab is created now, inside the click, so
    // the browser doesn't treat the later navigation as a popup.
    const viewAs = forceDownload ? null : viewableMime(f.mime, f.name);
    const tab = viewAs ? window.open("", "_blank") : null;
    if (tab) showLoading(tab, f.name);
    setOpening(f.id);
    try {
      // Local copy first; otherwise download and keep a copy for next time.
      let bytes = await cacheGet(f.id);
      if (!bytes) {
        const r = await fetch(`/api/files/${f.id}/download`);
        if (!r.ok) throw new Error("fetch");
        bytes = await r.arrayBuffer();
        cachePut(f.id, bytes);
        setLocal((s) => new Set(s).add(f.id));
      }
      if (f.encrypted) {
        if (!getRawKey()) {
          tab?.close();
          setToast({ text: "Couldn't open this file. Sign out and back in, then try again." });
          return;
        }
        bytes = await decryptFile(bytes, f.chunked);
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: viewAs ?? f.mime }));
      if (tab) {
        tab.location.href = url;
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = f.name;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      tab?.close();
      setToast({ text: `Couldn't open ${f.name}.`, retry: () => open(f) });
    } finally {
      setOpening(null);
    }
  }

  // Sign out: the session ends and this browser forgets the key and its local
  // copies. The files stay in the account; sign in anywhere to see them.
  async function signOut() {
    copyCtrl.current?.abort();
    await fetch("/api/auth/signout", { method: "POST" });
    clearRawKey();
    localStorage.removeItem("stash_gd_done_v1");
    await cacheClear();
    location.href = "/signin";
  }

  // Start fresh: delete every file in the account and start with a new key.
  // Reached via /drive?demo=1 so it never shows to a normal user.
  async function resetDemo() {
    if (!confirm("Start fresh? This deletes every file in this account.")) return;
    await fetch("/api/me", { method: "DELETE" });
    clearRawKey();
    localStorage.removeItem("stash_gd_done_v1");
    await cacheClear();
    location.reload();
  }

  const all = files ?? [];
  const empty = files !== null && all.length === 0;

  // A phone code may be showing (tile or "Open on another device"): follow the phone. When its first photo lands,
  // close the code and take this screen to Phone photos. While that folder is
  // open, keep it fresh so photos appear as the phone sends them.
  const phoneCount = all.filter((f) => f.source === "phone").length;
  const baseline = useRef(phoneCount);
  useEffect(() => {
    if (pairOpen) baseline.current = phoneCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot only when the code opens
  }, [pairOpen]);
  useEffect(() => {
    if (!pairOpen && folder !== "Phone photos") return;
    const t = setInterval(async () => {
      const f = await fetch("/api/files").then((r) => r.json()).catch(() => null);
      if (!f) return;
      setFiles(f.files);
      const n = (f.files as FileRow[]).filter((x) => x.source === "phone").length;
      if (pairOpen && n > baseline.current) {
        setPairOpen(null);
        setFolder("Phone photos");
        setToast({ text: "Your phone is backing up. Photos appear here as they arrive." });
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pairOpen, folder, setFolder]);

  return (
    <main
      className="flex-1 flex flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      <header className="mx-auto w-full max-w-5xl px-5 py-5 flex items-center justify-between gap-4">
        <Logo />
        <div className="flex items-center gap-4 text-sm">
          {me && (
            <span className="hidden sm:inline text-ink-2" data-testid="usage">
              {me.fileCount} files · {fmtBytes(me.bytes)} of <span className="font-semibold text-ink">unlimited</span>
            </span>
          )}
          <Link href="/devices" className="text-ink-2 hover:text-ink underline-offset-4 hover:underline" data-testid="nav-devices">
            Devices
          </Link>
          <Link href="/settings" className="text-ink-2 hover:text-ink underline-offset-4 hover:underline" data-testid="nav-settings">
            Settings
          </Link>
          <button className="text-ink-3 hover:text-ink underline-offset-4 hover:underline" onClick={signOut} data-testid="sign-out">
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-5 pb-24 flex-1">
        {chooseProtection && me && !needPasscode && (
          <section className="card mb-5 p-5" aria-labelledby="choose-protection" data-testid="choose-protection">
            <h2 id="choose-protection" className="text-xl font-semibold">How should your files be protected?</h2>
            <p className="mt-1 text-sm text-ink-2">Every file is encrypted before it is stored either way. You can change this later in Settings.</p>
            <div className="mt-4">
              <ProtectionChoice
                current={null}
                onChanged={() => {
                  setChooseProtection(false);
                  refresh();
                }}
              />
            </div>
          </section>
        )}
        {migration.phase === "done" && (
          <div className="card mb-5 p-4 flex flex-wrap items-center gap-3 bg-ok-soft border-ok/30" role="status" data-testid="migration-done">
            <div className="flex-1">
              <p className="font-semibold">Your Google Drive is here.</p>
              <p className="text-sm text-ink-2">
                {migration.total.toLocaleString()} files · {fmtBytes(migration.bytes)}. You can cancel Google One now.
              </p>
            </div>
            <a className="btn-ghost text-ok underline underline-offset-4" href="https://one.google.com/storage" target="_blank" rel="noreferrer">
              Cancel Google One →
            </a>
          </div>
        )}
        {(migration.phase === "copying" || migration.phase === "scanning" || migration.phase === "stopped") && (
          <ProgressBanner
            s={migration}
            activity={activity}
            onGoToFolder={setFolder}
            onStop={realGoogle ? stopGoogleCopy : undefined}
            onResume={realGoogle ? startGoogleCopy : undefined}
          />
        )}

        {pairOpen === "card" && (
          <PairCard
            mode="card"
            email={me?.email ?? null}
            onClose={(dismissForGood) => {
              if (dismissForGood) localStorage.setItem(DISMISS_KEY, "1");
              setPairOpen(null);
            }}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <nav className="flex items-center gap-1 text-lg" aria-label="Folder path">
            <button className="font-semibold hover:underline" onClick={() => setFolder("")}>
              My drive
            </button>
            {folder
              .split("/")
              .filter(Boolean)
              .map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-ink-3">/</span>
                  <button className="hover:underline" onClick={() => setFolder(arr.slice(0, i + 1).join("/"))}>
                    {part}
                  </button>
                </span>
              ))}
          </nav>
          {!empty && (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <label className="relative w-full sm:w-auto order-last sm:order-none">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M9.2 9.2 12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  aria-label="Search files"
                  className="w-full sm:w-44 sm:focus:w-64 transition-[width] rounded-full border border-line bg-white pl-8 pr-3 py-2 text-sm outline-none focus:border-ink"
                  data-testid="search"
                />
              </label>
              <span className="hidden sm:inline">
                <button className="btn-ghost" onClick={addSample} data-testid="add-sample">
                  Add a sample file
                </button>
              </span>
              {/* On a phone the job is its own camera roll; Google Drive moves are a laptop job.
                  Chosen in CSS (pointer-coarse) so the right one is there on first paint. */}
              <span className="hidden pointer-coarse:contents">
                <Link href="/m" className="btn-ghost flex-1 border border-line text-ink whitespace-nowrap" data-testid="toolbar-photos">
                  {folder === "Phone photos" ? "Back up new photos" : "Back up photos"}
                </Link>
              </span>
              <span className="contents pointer-coarse:hidden">
                <button className="btn-ghost whitespace-nowrap" onClick={() => setMigrateOpen(true)} data-testid="migrate-gdrive">
                  Move from Google Drive
                </button>
              </span>
              {/* On a phone, Add is the floating button below. */}
              <span className="contents pointer-coarse:hidden">
                {/* .btn-primary is unlayered CSS, so utility classes can't shrink it; inline style can. */}
                <button
                  className="btn-primary text-sm"
                  style={{ padding: "0.4rem 0.85rem", borderRadius: "0.5rem" }}
                  onClick={() => inputRef.current?.click()}
                  data-testid="upload"
                  disabled={!!busy}
                >
                  {busy ? "Working…" : "+ Add"}
                </button>
              </span>
            </div>
          )}
        </div>

        {!empty && files && (
          <button
            className="hidden pointer-coarse:flex fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] z-30 size-14 items-center justify-center rounded-full bg-ink text-white text-3xl leading-none shadow-lg active:scale-95 transition disabled:opacity-50"
            onClick={() => inputRef.current?.click()}
            aria-label="Add a file"
            data-testid="upload-phone"
            disabled={!!busy}
          >
            {busy ? <span className="size-5 rounded-full border-2 border-white border-r-transparent animate-spin" /> : "+"}
          </button>
        )}

        <input ref={inputRef} type="file" multiple className="sr-only" onChange={(e) => e.target.files && upload(e.target.files)} aria-label="Choose files to add" />

        {files === null && (
          <ul className="card divide-y divide-line overflow-hidden" aria-busy="true" aria-label="Loading">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="px-5 py-4">
                <div className="h-4 w-1/3 rounded bg-cream-2" />
              </li>
            ))}
          </ul>
        )}

        {empty && (
          <section className="pt-6">
            <h1 className="rise text-4xl sm:text-5xl font-semibold">Where should we start?</h1>
            <p className="rise-2 mt-2 text-lg text-ink-2">
              Pick one. Everything is encrypted on this device before it leaves.{" "}
              <button className="underline" onClick={addSample} data-testid="add-sample">
                Add a sample file
              </button>
              .
            </p>
            <div className="rise-3 mt-8 grid gap-4 sm:grid-cols-3">
              <button className="tile" onClick={() => setMigrateOpen(true)} data-testid="tile-gdrive">
                <GDriveIcon />
                <span className="text-xl font-semibold">Move my Google Drive</span>
                <span className="text-ink-2">Everything, folders included. Then cancel Google One.</span>
              </button>
              <span className="hidden pointer-coarse:contents">
                <Link href="/m" className="tile" data-testid="tile-photos-phone">
                  <PhoneIcon />
                  <span className="text-xl font-semibold">Back up this phone&apos;s photos</span>
                  <span className="text-ink-2">Pick them once. Encrypted here before they leave.</span>
                </Link>
              </span>
              <span className="contents pointer-coarse:hidden">
                <button className="tile" onClick={() => setPairOpen("qr")} data-testid="tile-photos">
                  <PhoneIcon />
                  <span className="text-xl font-semibold">Back up my phone photos</span>
                  <span className="text-ink-2">Point your phone camera at a code. One tap after that.</span>
                </button>
              </span>
              <button className="tile" onClick={() => inputRef.current?.click()} data-testid="tile-upload">
                <FileIcon />
                <span className="text-xl font-semibold">Add a file</span>
                <span className="text-ink-2">Or drag a file onto this page.</span>
              </button>
            </div>
          </section>
        )}

        {pairOpen === "qr" && (
          <div className="mt-4">
            <PairCard mode="qr" email={null} onClose={() => setPairOpen(null)} />
          </div>
        )}

        {/* On a phone this lives in the toolbar; on a laptop the phone is elsewhere, so offer its code. */}
        {!empty && files && folder === "Phone photos" && !search && (
          <div className="mb-4 pointer-coarse:hidden flex items-center justify-between gap-3 rounded-xl bg-cream-2 px-4 py-2.5" data-testid="photos-bar">
            <p className="text-sm text-ink-2">Back up more from your phone.</p>
            <button className="text-sm font-medium underline-offset-4 hover:underline whitespace-nowrap" onClick={() => setPairOpen("qr")}>
              Show phone code
            </button>
          </div>
        )}

        {!empty && files && (
          <FileBrowser
            files={all}
            folder={folder}
            search={search}
            local={local}
            opening={opening}
            onOpenFolder={(p) => {
              setSearch("");
              setFolder(p);
            }}
            onOpen={(f) => open(f)}
            onDownload={(f) => open(f, true)}
            onRename={rename}
            onTrash={trash}
          />
        )}
        {/* Room under the last row so the floating + never covers its menu. */}
        {!empty && files && <div className="hidden pointer-coarse:block h-20" aria-hidden />}
      </div>

      {dragging && (
        <div className="fixed inset-0 bg-white/90 border-2 border-ink m-3 rounded-2xl flex items-center justify-center pointer-events-none">
          <p className="text-2xl font-semibold">Drop to add</p>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 pointer-coarse:bottom-24 left-1/2 -translate-x-1/2 bg-ink text-cream px-5 py-3 rounded-full shadow-lg rise flex items-center gap-4" role="status">
          {toast.text}
          {toast.retry && (
            <button className="underline" onClick={toast.retry}>
              Retry
            </button>
          )}
          {toast.undo && (
            <button className="underline font-medium" onClick={toast.undo} data-testid="undo">
              Undo
            </button>
          )}
        </div>
      )}


      <MigrateDialog
        open={migrateOpen}
        status={migration}
        real={realGoogle}
        onClose={() => {
          setMigrateOpen(false);
          // One-time reassurance when they leave the dialog mid-copy.
          if (migration.phase === "copying" || migration.phase === "scanning") setToast({ text: "Keep using your drive. The copy continues in the background." });
        }}
        onStart={startMigration}
        onStop={realGoogle ? stopGoogleCopy : undefined}
        onSwitchAccount={
          realGoogle
            ? async () => {
                // Forget the Google link and copy progress, then go to Google's account chooser.
                copyCtrl.current?.abort();
                await fetch("/api/google", { method: "DELETE" });
                localStorage.removeItem("stash_gd_done_v1");
                location.href = "/api/google/auth?switch=1";
              }
            : undefined
        }
      />

      {needPasscode && me && (
        <AskPasscode
          body="Your files are locked with a passcode. Enter it once on this device."
          wrapped={me.keyWrapped ?? null}
          onUnlocked={() => setNeedPasscode(false)}
        />
      )}

      {demoTools && (
        <button onClick={resetDemo} className="fixed bottom-4 right-4 text-xs text-ink-3 hover:text-ink underline" title="Forget this device's drive, key and Google connection" data-testid="start-fresh">
          Start fresh
        </button>
      )}
    </main>
  );
}

// One line that answers: what is it doing, where from, where to.
//   Moving  Thesis final.pdf  ·  from Google Drive / School  ·  into School
function ActivityFeed({ e, onGoToFolder }: { e: CopyEvent | null; onGoToFolder: (folder: string) => void }) {
  if (!e) return null;
  // Long paths collapse to "First / … / Last"; the full path is on hover.
  const crumbs = (p: string) => {
    const parts = p.split("/").filter(Boolean);
    return parts.length > 3 ? `${parts[0]} / … / ${parts[parts.length - 1]}` : parts.join(" / ");
  };
  return (
    <p className="mt-2 text-xs text-ink-3 flex items-baseline gap-x-2 min-w-0 whitespace-nowrap overflow-hidden" aria-live="polite" data-testid="activity" title={e.name ? `${e.from}${e.path ? " / " + e.path : ""} / ${e.name}` : undefined}>
      {/* Left: what and which file. Right: where from, right-aligned. Both clip, neither moves. All one quiet tone. */}
      <span className="truncate shrink min-w-0 max-w-[55%]">
        {e.action}
        {e.name && ` ${e.name}`}
      </span>
      {e.name && (
        <span className="truncate shrink min-w-0 ml-auto text-right">
          from {e.from}
          {e.path ? ` / ${crumbs(e.path)}` : ""}
        </span>
      )}
      {e.to !== undefined && (
        <span className="text-ink-3 shrink-0 truncate">
          · into{" "}
          <button className="underline underline-offset-2 hover:text-ink" onClick={() => onGoToFolder(e.to!)}>
            {e.to ? crumbs(e.to) : "My drive"}
          </button>
        </span>
      )}
    </p>
  );
}

function ProgressBanner({
  s,
  activity,
  onGoToFolder,
  onStop,
  onResume,
}: {
  s: MigrationStatus;
  activity: CopyEvent | null;
  onGoToFolder: (folder: string) => void;
  onStop?: () => void;
  onResume?: () => void;
}) {
  if (s.phase === "scanning")
    return (
      <div className="card mb-5 p-4" role="status" data-testid="migration-progress">
        <div className="flex items-center gap-3">
          <span className="inline-block size-4 rounded-full border-2 border-ink-3 border-t-accent animate-spin" aria-hidden />
          <p className="font-medium">Reading your Google Drive. A large Drive takes a minute or two.</p>
        </div>
        <ActivityFeed e={activity} onGoToFolder={onGoToFolder} />
      </div>
    );
  if (s.phase !== "copying" && s.phase !== "stopped") return null;
  const stopped = s.phase === "stopped";
  return (
    <div className="card mb-5 px-4 py-3" role="status" data-testid="migration-progress">
      <div className="flex items-center gap-3">
        <p className="font-medium truncate">
          {stopped ? "Copy stopped" : "Copying from Google Drive"} · {s.copiedCount.toLocaleString()} of {s.total.toLocaleString()}
        </p>
        <p className="ml-auto text-sm text-ink-2 shrink-0">
          {fmtBytes(s.copiedBytes)} / {fmtBytes(s.bytes)} · {s.percent}%
        </p>
        {stopped && onResume && <IconButton label="Resume copy" onClick={onResume} icon="play" />}
        {!stopped && onStop && <IconButton label="Stop copy" onClick={onStop} icon="stop" testId="banner-stop" />}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-cream-2 overflow-hidden">
        <div className="h-full bg-accent transition-all duration-700" style={{ width: `${s.percent}%` }} />
      </div>
      {stopped ? <p className="mt-2 text-xs text-ink-3">Nothing is lost. Resume any time.</p> : <ActivityFeed e={activity} onGoToFolder={onGoToFolder} />}
    </div>
  );
}

export function IconButton({ label, onClick, icon, testId }: { label: string; onClick: () => void; icon: "stop" | "play"; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink hover:bg-cream-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      {icon === "stop" ? (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M3.5 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5Z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}

function PhoneIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="9" y="3" width="14" height="26" rx="3" />
      <path d="M14 25h4" strokeLinecap="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M8 3h11l6 6v20H8z" strokeLinejoin="round" />
      <path d="M19 3v6h6" strokeLinejoin="round" />
    </svg>
  );
}

function GDriveIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 87.3 78" aria-hidden>
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

// The viewer tab opens inside the click (so it isn't blocked as a popup) but the
// file still has to download and decrypt. Show that instead of a blank page.
function showLoading(tab: Window, name: string) {
  const d = tab.document;
  d.title = name;
  d.body.innerHTML = `<style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fafafa;color:#111;font:16px/1.4 system-ui,-apple-system,sans-serif}
    @media (prefers-color-scheme:dark){body{background:#111;color:#f5f5f5}}
    .s{width:28px;height:28px;margin:0 auto 16px;border:3px solid currentColor;border-right-color:transparent;border-radius:50%;opacity:.6;animation:r .8s linear infinite}
    @keyframes r{to{transform:rotate(1turn)}}
    p{margin:0;text-align:center;padding:0 24px;word-break:break-word}
    small{display:block;margin-top:4px;opacity:.6}
  </style><div role="status"><div class="s"></div><p></p><small>Decrypting on this device</small></div>`;
  d.querySelector("p")!.textContent = `Opening ${name}…`;
}

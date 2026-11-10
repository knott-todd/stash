"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DRAG_TYPE, FileBrowser } from "./FileBrowser";
import { Logo } from "./Logo";
import { left, MigrateDialog, statusOf, type MigrationStatus } from "./MigrateDialog";
import { PairCard } from "./PairCard";
import { SetupSteps } from "./SetupSteps";
import { PhotosView } from "./PhotosView";
import { MoveDialog } from "./MoveDialog";
import { AppHeader } from "./AppHeader";
import { ShareDialog } from "./ShareDialog";
import { fmtBytes } from "@/lib/format";
import { clearRawKey, decryptFile, getRawKey, setRawKey, type WrappedKey } from "@/lib/crypto";
import { AskPasscode, ProtectionChoice } from "./Protection";
import { rememberAccount } from "@/lib/accounts";
import Link from "next/link";
import { doneKey, PROVIDER_LABEL, providerEndpoints, runProviderCopy, type CopyEvent, type Provider } from "@/lib/provider-client";
import { copyAction, currentCopy, loadCopies, useCopies, useOnCopied } from "@/lib/copy-client";
import { driveFolder } from "@/lib/copy-types";
import { cacheClear, cacheDelete, cacheGet, cacheHas, cachePut } from "@/lib/filecache";
import { Lightbox, type Origin } from "./Lightbox";
import { Download, FolderPlus, HardDrive, HardDriveDownload, LayoutGrid, LayoutList, Search, Trash2, Upload, X } from "lucide-react";
import { viewableMime } from "@/lib/view";
import { demoMode } from "@/lib/demo-flag";
import { uploadEncrypted, uploadMode } from "@/lib/upload";
import { ExperimentalNotice } from "./ExperimentalNotice";

export type FileRow = {
  id: string;
  name: string;
  size: number;
  mime: string;
  folder: string;
  source: "upload" | "google-drive" | "dropbox" | "onedrive" | "phone" | "desktop";
  createdAt: number;
  encrypted: boolean;
  chunked: boolean;
  thumb: boolean;
  modifiedAt: number | null;
  deviceId: string | null;
  shared: boolean;
  stored: boolean;
};


type Me = {
  signedIn: boolean;
  demo: boolean;
  google: boolean;
  googleConnected: boolean;
  providers?: Record<"dropbox" | "onedrive", { enabled: boolean; connected: boolean }>;
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
  // The simulated move (Google not configured). Real moves are records on the server.
  const [demoMigration, setDemoMigration] = useState<MigrationStatus>({ phase: "idle" });
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; retry?: () => void; undo?: () => void } | null>(null);
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pairOpen, setPairOpen] = useState<"card" | "qr" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const demoTools = demoMode(params);
  // Which screen: the folders, or every picture and video at once.
  const tab = params.get("view") === "photos" ? "photos" : "drive";
  // List or grid, remembered on this browser.
  const [view, setView] = useState<"list" | "grid">("list");
  useEffect(() => {
    try {
      if (localStorage.getItem("stash_view_v1") === "grid") setView("grid"); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage exists only after mount
    } catch {}
  }, []);
  const chooseView = (v: "list" | "grid") => {
    setView(v);
    try {
      localStorage.setItem("stash_view_v1", v);
    } catch {}
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [computers, setComputers] = useState(0);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [shareFile, setShareFile] = useState<FileRow | null>(null);
  const [setupHidden, setSetupHidden] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("stash_setup_hidden_v1") === "1") setSetupHidden(true); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage exists only after mount
    } catch {}
  }, []);
  // Locked account on a device without the key: ask for the passcode before anything else.
  const [needPasscode, setNeedPasscode] = useState(false);
  // First sign-in: choose how the files are protected.
  const [chooseProtection, setChooseProtection] = useState(false);

  const [deviceBusy, setDeviceBusy] = useState(false);
  const refresh = useCallback(async () => {
    const [m, f, fo, dv] = await Promise.all([
      fetch("/api/me").then((r) => r.json()),
      fetch("/api/files").then((r) => r.json()),
      fetch("/api/folders").then((r) => r.json()).catch(() => ({ folders: [] })),
      fetch("/api/devices").then((r) => r.json()).catch(() => ({ devices: [] })),
    ]);
    setMe(m);
    setFiles(f.files ?? []);
    setExtraFolders(fo.folders ?? []);
    setComputers(((dv.devices ?? []) as { kind: string }[]).filter((d) => d.kind === "desktop").length);
    setDeviceBusy(((dv.devices ?? []) as { state?: { status?: string } | null }[]).some((d) => d.state?.status === "uploading" || d.state?.status === "scanning"));
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
          .then(setDemoMigration)
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
  // Which drive the move is from. Google Drive has its own routes; Dropbox and
  // OneDrive share the provider routes. One copy runs at a time.
  const [provider, setProvider] = useState<Provider>("google-drive");
  const providerReady = (p: Provider) => (p === "google-drive" ? realGoogle : !!me?.providers?.[p]?.enabled);
  const providerConnected = (p: Provider) => (p === "google-drive" ? !!me?.googleConnected : !!me?.providers?.[p]?.connected);

  // The move's record lives on the server: Standard accounts copy there with no tab
  // open, passcode accounts copy in this tab and report in. Either way the progress
  // comes back on every visit.
  const { copies, loaded: copiesLoaded } = useCopies(!!me?.signedIn && realGoogle);
  const rec = currentCopy(copies);
  useOnCopied(copies, refresh);
  // This tab's own browser copy (passcode accounts), while it runs.
  const [browserStatus, setBrowserStatus] = useState<MigrationStatus | null>(null);
  const migration: MigrationStatus = !realGoogle ? demoMigration : (browserStatus ?? (rec ? statusOf(rec) : { phase: "idle" }));
  // Where this move runs (or will): passcode accounts in this browser, everyone else on the server.
  const copyWhere: "server" | "browser" | null = !realGoogle ? null : browserStatus || rec?.mode === "browser" || (!rec && me?.protection === "passcode") ? "browser" : "server";
  useEffect(() => {
    if (rec && rec.provider !== provider && (rec.state === "running" || rec.state === "listing")) setProvider(rec.provider); // eslint-disable-line react-hooks/set-state-in-effect -- follows the server record
  }, [rec, provider]);
  // What the server copy last did, for the status line.
  const shownActivity: CopyEvent | null = browserStatus ? activity : rec?.last ? { action: "Saved", name: rec.last.name, from: PROVIDER_LABEL[rec.provider], path: driveFolder(rec.provider, rec.last.folder), to: rec.last.folder } : null;

  const startBrowserCopy = useCallback(
    (p: Provider) => {
      // Never two at once, and never restart one that's running: an upload cut off midway
      // would land without being marked done, and be copied again.
      copyStarted.current = true;
      if (copyCtrl.current && !copyCtrl.current.signal.aborted) return;
      const ctrl = new AbortController();
      copyCtrl.current = ctrl;
      setProvider(p);
      try {
        if (!localStorage.getItem(doneKey(p))) localStorage.setItem(doneKey(p), "[]");
      } catch {}
      runProviderCopy(p, setBrowserStatus, refresh, ctrl.signal, logEvent)
        .catch(() => {
          // Only a lost connection to the drive itself ends up here; Settings offers to reconnect.
          if (!ctrl.signal.aborted) setToast({ text: `${PROVIDER_LABEL[p]} needs you to connect it again.`, retry: () => (location.href = providerEndpoints(p).auth) });
        })
        .finally(() => {
          if (copyCtrl.current === ctrl) {
            copyCtrl.current = null;
            setBrowserStatus(null);
          }
          loadCopies();
        });
    },
    [refresh, logEvent],
  );

  // Start, or carry on, a move. The server decides where it runs.
  const runCopy = useCallback(
    async (p: Provider, action: "start" | "resume") => {
      setProvider(p);
      copyStarted.current = true;
      const j = await copyAction(p, action);
      if (j.reconnect) {
        location.href = providerEndpoints(p).auth;
        return;
      }
      if (j.copy?.mode === "browser") startBrowserCopy(p);
    },
    [startBrowserCopy],
  );
  const stopCopy = () => {
    copyCtrl.current?.abort();
    setBrowserStatus(null);
    copyAction(provider, "stop");
  };
  const resumeCopy = () => runCopy(provider, "resume");

  // Back from a consent screen (?google=ok, or ?connected=dropbox&result=ok): start the move.
  // A browser copy (passcode accounts) that was interrupted carries on here. A copy begun
  // before copies lived on the server (only a done-list in this browser) moves over to it.
  const connectedFlag = params.get("connected");
  const resultFlag = params.get("result");
  useEffect(() => {
    if (!me || !realGoogle || copyStarted.current) return;
    const came: Provider | null = googleFlag ? "google-drive" : connectedFlag === "dropbox" || connectedFlag === "onedrive" ? connectedFlag : null;
    const result = googleFlag ?? resultFlag;
    if (came && result === "denied") setToast({ text: `${PROVIDER_LABEL[came]} didn't allow access. Try again or add files yourself.` });
    if (came && result === "failed") setToast({ text: `Couldn't connect to ${PROVIDER_LABEL[came]}. Try again.`, retry: () => (location.href = providerEndpoints(came).auth) });
    if (came && result === "ok" && providerReady(came)) {
      copyStarted.current = true;
      setMigrateOpen(true);
      runCopy(came, "start");
      return;
    }
    if (!copiesLoaded) return;
    for (const p of ["google-drive", "dropbox", "onedrive"] as Provider[]) {
      if (!providerReady(p) || !providerConnected(p)) continue;
      const r = copies.find((c) => c.provider === p);
      let legacy = false;
      try {
        legacy = !r && localStorage.getItem(doneKey(p)) !== null;
      } catch {}
      if (r?.mode === "browser" && (r.state === "running" || r.state === "listing")) {
        copyStarted.current = true;
        startBrowserCopy(p);
        return;
      }
      if (legacy) {
        copyStarted.current = true;
        runCopy(p, "start");
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, googleFlag, connectedFlag, copiesLoaded]);
  useEffect(() => () => copyCtrl.current?.abort(), []);

  // Which files have a local copy (ciphertext in the browser cache).
  const [local, setLocal] = useState<Set<string>>(new Set());
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    if (!files) return;
    cacheHas(files.map((f) => f.id)).then(setLocal);
  }, [files]);

  // Live: while a device is sending files the list is checked every 10 s, otherwise every 60 s.
  // The check is the catalogue's revision number, a few bytes; the list itself is fetched only when it moved.
  const rev = useRef<number | null>(null);
  useEffect(() => {
    if (!files) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const j = await fetch("/api/files/rev").then((r) => r.json()).catch(() => null);
      if (!j || typeof j.rev !== "number") return;
      if (rev.current !== null && j.rev === rev.current) return;
      rev.current = j.rev;
      refresh().catch(() => {});
    }, deviceBusy ? 10_000 : 60_000);
    return () => clearInterval(t);
  }, [files, deviceBusy, refresh]);

  // Keep a copy of these on this device, or drop the copies. Only ciphertext is kept.
  async function setLocalMany(batch: FileRow[], keep: boolean) {
    const stored = batch.filter((f) => f.stored);
    for (const f of stored) {
      if (!keep) await cacheDelete(f.id);
      else if (!(await cacheGet(f.id))) {
        const r = await fetch(`/api/files/${f.id}/download`);
        if (r.ok) await cachePut(f.id, await r.arrayBuffer());
      }
    }
    setLocal(await cacheHas((files ?? []).map((f) => f.id)));
    setToast({ text: keep ? `${stored.length === 1 ? stored[0].name : stored.length + " files"} kept on this device` : `${stored.length === 1 ? stored[0].name : stored.length + " files"} removed from this device` });
  }

  // The corner radii the thumbnail actually shows: its own, or those of the nearest clipping
  // ancestor at the corners they share (a grid tile is round at the top, square where the name sits).
  function cornerRadii(el: HTMLElement | null): [number, number, number, number] {
    if (!el) return [0, 0, 0, 0];
    const px = (v: string) => parseFloat(v) || 0;
    const own = getComputedStyle(el);
    const r: [number, number, number, number] = [px(own.borderTopLeftRadius), px(own.borderTopRightRadius), px(own.borderBottomRightRadius), px(own.borderBottomLeftRadius)];
    const a = el.getBoundingClientRect();
    // Walk up to the tile itself: every clipping ancestor may round a corner the picture shares.
    const tile = el.closest<HTMLElement>("[data-file-id]");
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const last = n === tile;
      if (cs.overflow === "visible" && cs.overflowX === "visible") {
        if (last) break;
        continue;
      }
      const b = n.getBoundingClientRect();
      const near = (x: number, y: number) => Math.abs(x - y) < 1.5;
      if (near(a.left, b.left) && near(a.top, b.top)) r[0] = Math.max(r[0], px(cs.borderTopLeftRadius));
      if (near(a.right, b.right) && near(a.top, b.top)) r[1] = Math.max(r[1], px(cs.borderTopRightRadius));
      if (near(a.right, b.right) && near(a.bottom, b.bottom)) r[2] = Math.max(r[2], px(cs.borderBottomRightRadius));
      if (near(a.left, b.left) && near(a.bottom, b.bottom)) r[3] = Math.max(r[3], px(cs.borderBottomLeftRadius));
      if (last) break;
    }
    return r;
  }

  // Pictures and videos open in place; everything else opens in a tab or downloads.
  const [lightbox, setLightbox] = useState<{ items: FileRow[]; index: number; from?: Origin } | null>(null);
  const isVisual = (f: FileRow) => f.stored && (f.mime.startsWith("image/") || f.mime.startsWith("video/"));
  function openAny(f: FileRow, pool: FileRow[]) {
    if (!isVisual(f)) return open(f);
    // Arrows follow what is on screen (sorted, filtered, grouped), not the raw list: read the rendered order.
    const byId = new Map(pool.map((x) => [x.id, x]));
    const shown = [...document.querySelectorAll<HTMLElement>("[data-file-id]")].map((e) => byId.get(e.dataset.fileId ?? "")).filter((x): x is FileRow => !!x);
    const items = (shown.length ? shown : pool).filter(isVisual);
    setLightbox({ items, index: Math.max(0, items.findIndex((x) => x.id === f.id)), from: originFor(f) });
  }

  // Where a file's tile is on screen right now, and what it shows: the lightbox grows out of it and
  // shrinks back into it. Undefined when the tile is not on screen.
  function originFor(f: FileRow): Origin | undefined {
    const el = document.querySelector<HTMLElement>(`[data-file-id="${f.id}"]`);
    if (!el) return undefined;
    const img = el.querySelector("img");
    const rect = (img ?? el).getBoundingClientRect();
    if (rect.width === 0 || rect.bottom < 0 || rect.top > window.innerHeight) return undefined;
    return { rect, src: img?.currentSrc || undefined, aspect: img && img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : undefined, radii: cornerRadii(img ?? el) };
  }

  useEffect(() => {
    if (realGoogle) return;
    if (demoMigration.phase !== "copying" && demoMigration.phase !== "scanning") return;
    const t = setInterval(async () => {
      const s: MigrationStatus = await fetch("/api/migrate").then((r) => r.json());
      setDemoMigration(s);
      if (s.phase === "copying" || s.phase === "done") refresh();
    }, 1000);
    return () => clearInterval(t);
  }, [demoMigration.phase, refresh, realGoogle]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.retry ? 10000 : toast.undo ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function startMigration() {
    if (providerReady(provider)) {
      // Carry on after a stop or an unfinished run; a connected drive starts straight away;
      // otherwise consent lives on the provider's screen.
      if (migration.phase === "stopped" || (migration.phase === "done" && left(migration) > 0)) return resumeCopy();
      if (providerConnected(provider)) return runCopy(provider, "start");
      location.href = providerEndpoints(provider).auth;
      return;
    }
    setDemoMigration(await fetch("/api/migrate", { method: "POST" }).then((r) => r.json()));
  }

  // Open the move dialog for one provider.
  function openMove(p: Provider) {
    if (migration.phase === "idle" || migration.phase === "done") setProvider(p);
    setMigrateOpen(true);
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
  // Trashing one of several selected files trashes them all.
  const pendingTrash = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // A selection may hold files ("<id>") and folders ("d:<path>"); folders mean everything inside them.
  const filesForKeys = (keys: Iterable<string>) => {
    const ks = [...keys];
    const dirs = ks.filter((k) => k.startsWith("d:")).map((k) => k.slice(2));
    return (files ?? []).filter((x) => ks.includes(x.id) || dirs.some((d) => x.folder === d || x.folder.startsWith(d + "/")));
  };

  function trash(f: FileRow) {
    trashMany(selected.has(f.id) && selected.size > 1 ? filesForKeys(selected) : [f], f.name);
  }

  function trashMany(batch: FileRow[], firstName: string) {
    if (!batch.length) return;
    const ids = batch.map((x) => x.id);
    setFiles((fs) => fs && fs.filter((x) => !ids.includes(x.id)));
    setSelected(new Set());
    const t = setTimeout(async () => {
      let failed = 0;
      for (const x of batch) {
        pendingTrash.current.delete(x.id);
        const r = await fetch(`/api/files/${x.id}`, { method: "DELETE" });
        if (!r.ok) failed++;
      }
      if (failed) {
        setToast({ text: failed === 1 ? `Couldn't delete ${batch[0].name}.` : `Couldn't delete ${failed} files.` });
        refresh();
      }
    }, 6000);
    for (const x of batch) pendingTrash.current.set(x.id, t);
    setToast({
      text: batch.length === 1 ? `${firstName} moved to trash.` : `${batch.length} files moved to trash.`,
      undo: () => {
        clearTimeout(t);
        for (const x of batch) pendingTrash.current.delete(x.id);
        setToast(null);
        refresh();
      },
    });
  }

  // Move files into a folder (drag, or the Move dialog).
  // Move files and folders. A folder goes into the target with its name and
  // everything under it; a file lands in the target itself.
  async function moveFiles(keys: string[], target: string) {
    const dirs = keys.filter((k) => k.startsWith("d:")).map((k) => k.slice(2));
    // A folder cannot go into itself or into one of its own subfolders.
    if (dirs.some((d) => target === d || target.startsWith(d + "/"))) {
      setToast({ text: "A folder can't be moved into itself." });
      setMoveIds(null);
      return;
    }
    const plan = new Map<string, string[]>(); // destination folder → file ids
    for (const x of files ?? []) {
      let dest: string | null = null;
      if (keys.includes(x.id)) dest = target;
      else {
        const d = dirs.find((p) => x.folder === p || x.folder.startsWith(p + "/"));
        if (d) {
          const name = d.split("/").pop()!;
          const rest = x.folder.slice(d.length).replace(/^\//, "");
          dest = [target, name, rest].filter(Boolean).join("/");
        }
      }
      if (dest !== null && dest !== x.folder) plan.set(dest, [...(plan.get(dest) ?? []), x.id]);
    }
    const total = [...plan.values()].reduce((n, ids) => n + ids.length, 0);
    if (!total) return;
    setFiles((fs) => fs && fs.map((x) => { for (const [dest, ids] of plan) if (ids.includes(x.id)) return { ...x, folder: dest }; return x; }));
    setSelected(new Set());
    setMoveIds(null);
    let failed = false;
    for (const [dest, ids] of plan) {
      const r = await fetch("/api/files", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, folder: dest }) });
      if (!r.ok) failed = true;
    }
    const where = target ? target.split("/").pop() : "My drive";
    if (failed) setToast({ text: "Couldn't move everything. Try again." });
    else setToast({ text: keys.length === 1 && !keys[0].startsWith("d:") ? `Moved to ${where}.` : `${keys.length === 1 ? "Folder" : `${keys.length} items`} moved to ${where}.` });
    refresh();
  }

  async function newFolder() {
    const name = prompt("Folder name");
    if (!name?.trim()) return;
    const path = [folder, name.trim().replace(/\//g, " ")].filter(Boolean).join("/");
    const r = await fetch("/api/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) });
    if (!r.ok) return setToast({ text: "Couldn't make that folder." });
    await refresh();
    setFolder(path);
  }

  // Folders people can move things into: every one that holds a file, plus the empty ones.
  const allFolders = Array.from(
    new Set([...(files ?? []).map((f) => f.folder), ...extraFolders].filter(Boolean).flatMap((p) => p.split("/").map((_, i, a) => a.slice(0, i + 1).join("/")))),
  );

  // Drop onto a crumb (or the "My drive" root) to move there.
  const crumbDrop = (path: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        moveFiles(JSON.parse(e.dataTransfer.getData(DRAG_TYPE)), path);
      } catch {}
    },
  });

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

  // Start fresh: delete every file in the account and start with a new key.
  // Reached via /drive?demo=1 so it never shows to a normal user.
  async function resetDemo() {
    if (!confirm("Start fresh? This deletes every file in this account.")) return;
    await fetch("/api/me", { method: "DELETE" });
    clearRawKey();
    for (const p of ["google-drive", "dropbox", "onedrive"] as Provider[]) localStorage.removeItem(doneKey(p));
    await cacheClear();
    location.reload();
  }

  const all = files ?? [];
  // The selection bar replaces the toolbar only when there is something to act on:
  // a file, or several items. A single folder click just highlights it.
  const showSelection = selected.size > 0;
  // The selection strip lives in the list's header row, which has a fixed height,
  // so the toolbar and the rows never move when something is selected.
  const selectionBar = showSelection ? (
                    <div className="flex items-center gap-4 text-sm" data-testid="selection-bar">
                      <span className="font-medium whitespace-nowrap">{selected.size} selected</span>
                      <button className="inline-flex items-center gap-1.5 hover:text-ink text-ink-2 whitespace-nowrap" onClick={async () => { for (const f of filesForKeys(selected).filter((x) => x.stored)) await open(f, true); }} data-testid="selection-download">
                        <Download size={15} /> Download
                      </button>
                      {filesForKeys(selected).some((x) => x.stored) &&
                        (filesForKeys(selected).filter((x) => x.stored).every((x) => local.has(x.id)) ? (
                          <button className="inline-flex items-center gap-1.5 hover:text-ink text-ink-2 whitespace-nowrap" onClick={() => setLocalMany(filesForKeys(selected), false)} data-testid="selection-remove-local">
                            <HardDrive size={15} /> Remove from this device
                          </button>
                        ) : (
                          <button className="inline-flex items-center gap-1.5 hover:text-ink text-ink-2 whitespace-nowrap" onClick={() => setLocalMany(filesForKeys(selected), true)} data-testid="selection-keep-local">
                            <HardDriveDownload size={15} /> Keep on this device
                          </button>
                        ))}
                      <button className="inline-flex items-center gap-1.5 hover:text-ink text-ink-2 whitespace-nowrap" onClick={() => setMoveIds([...selected])}>
                        <FolderPlus size={15} /> Move to…
                      </button>
                      <button
                        className="inline-flex items-center gap-1.5 hover:text-ink text-ink-2"
                        onClick={() => {
                          const batch = filesForKeys(selected);
                          const firstKey = [...selected][0];
                          trashMany(batch, firstKey.startsWith("d:") ? firstKey.slice(2).split("/").pop()! : (batch[0]?.name ?? ""));
                        }}
                      >
                        <Trash2 size={15} /> Trash
                      </button>
                      <button className="ml-auto text-ink-3 hover:text-ink" onClick={() => setSelected(new Set())} aria-label="Clear selection">
                        <X size={16} />
                      </button>
                    </div>
      ) : null;

  // The two setup steps, judged from what has actually happened.
  const setupState = {
    migrated: !!me?.googleConnected || !!me?.providers?.dropbox?.connected || !!me?.providers?.onedrive?.connected || all.some((f) => f.source === "google-drive" || f.source === "dropbox" || f.source === "onedrive") || migration.phase === "done",
    computer: computers > 0 || all.some((f) => f.source === "desktop"),
    phone: all.some((f) => f.source === "phone"),
    linked: {
      "google-drive": !!me?.googleConnected || all.some((f) => f.source === "google-drive"),
      dropbox: !!me?.providers?.dropbox?.connected || all.some((f) => f.source === "dropbox"),
      onedrive: !!me?.providers?.onedrive?.connected || all.some((f) => f.source === "onedrive"),
    },
  };
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
    let last: number | null = null;
    const t = setInterval(async () => {
      const j = await fetch("/api/files/rev").then((r) => r.json()).catch(() => null);
      if (!j || typeof j.rev !== "number" || j.rev === last) return;
      last = j.rev;
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

  // First sign-in: one decision, on its own screen, before anything else.
  if (chooseProtection && me && !needPasscode) {
    return (
      <main className="flex-1 flex flex-col" data-testid="choose-protection">
        <header className="mx-auto w-full max-w-5xl px-5 py-5">
          <Logo />
        </header>
        <section className="mx-auto w-full max-w-3xl px-5 pb-16 flex-1 flex flex-col justify-center">
          <p className="text-sm text-ink-3">One question before your files</p>
          <h1 className="mt-2 text-4xl sm:text-5xl font-semibold">How private should your files be?</h1>
          <p className="mt-3 text-lg text-ink-2">Every file is encrypted before it is stored either way. You can change this later in Settings.</p>
          <div className="mt-8">
            <ProtectionChoice
              current={null}
              onChanged={() => {
                setChooseProtection(false);
                refresh();
              }}
            />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      className="flex-1 flex flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onClick={(e) => {
        // Clicking anywhere that is not a row or a control clears the selection.
        const t = e.target as HTMLElement;
        if (selected.size && !t.closest("li[aria-selected], [data-testid=grid-file], [data-testid=selection-bar], [role=dialog], [role=menu], button, input, a, label, select, textarea")) setSelected(new Set());
      }}
      onDragOverCapture={(e) => {
        // Moving rows inside the drive is not a file drop from the desktop.
        if (e.dataTransfer.types.includes(DRAG_TYPE)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.types.includes(DRAG_TYPE)) return;
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      <AppHeader active={tab} usage={me ? `${me.fileCount.toLocaleString()} files · ${fmtBytes(me.bytes)}` : null} onBeforeSignOut={() => copyCtrl.current?.abort()} />

      <div className="mx-auto w-full max-w-5xl px-5 pb-24 flex-1">
        {migration.phase === "done" && left(migration) === 0 && (
          <div className="card mb-5 p-4 flex flex-wrap items-center gap-3 bg-ok-soft border-ok/30" role="status" data-testid="migration-done">
            <div className="flex-1">
              <p className="font-semibold">Your {PROVIDER_LABEL[provider]} is here.</p>
              <p className="text-sm text-ink-2">
                {migration.total.toLocaleString()} files · {fmtBytes(migration.bytes)}. {PROVIDER_LABEL[provider]} stays as it was.
              </p>
            </div>
          </div>
        )}
        {(migration.phase === "copying" || migration.phase === "scanning" || migration.phase === "stopped" || migration.phase === "waiting" || migration.phase === "reconnect" || (migration.phase === "done" && left(migration) > 0)) && (
          <ProgressBanner
            s={migration}
            activity={shownActivity}
            label={PROVIDER_LABEL[provider]}
            where={copyWhere}
            onGoToFolder={setFolder}
            onStop={providerReady(provider) ? stopCopy : undefined}
            onResume={providerReady(provider) ? resumeCopy : undefined}
            onReconnect={providerReady(provider) ? () => (location.href = providerEndpoints(provider).auth) : undefined}
          />
        )}

        {tab === "drive" && <ExperimentalNotice />}

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

        {!empty && files && !setupHidden && tab === "drive" && (
          <SetupSteps
            state={setupState}
            big={false}
            onStart={openMove} providers={{ dropbox: !!me?.providers?.dropbox?.enabled, onedrive: !!me?.providers?.onedrive?.enabled }}
            onDismiss={() => {
              setSetupHidden(true);
              try {
                localStorage.setItem("stash_setup_hidden_v1", "1");
              } catch {}
            }}
          />
        )}

        {tab === "photos" && files && (
          <>
            <h1 className="text-lg font-semibold mb-4">Photos</h1>
            <PhotosView files={all} opening={opening} onOpen={(f) => openAny(f, all)} />
          </>
        )}

        {tab === "drive" && (
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 mb-4 min-h-12">
          <nav className="flex items-center gap-1 text-lg min-w-0 truncate" aria-label="Folder path">
            <button className="font-semibold hover:underline rounded px-1 -mx-1" onClick={() => setFolder("")} {...crumbDrop("")}>
              My drive
            </button>
            {folder
              .split("/")
              .filter(Boolean)
              .map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-ink-3">/</span>
                  <button className="hover:underline rounded px-1 -mx-1" onClick={() => setFolder(arr.slice(0, i + 1).join("/"))} {...crumbDrop(arr.slice(0, i + 1).join("/"))}>
                    {part}
                  </button>
                </span>
              ))}
          </nav>
          {!empty && (
            <div className="flex items-center gap-3 w-full sm:w-auto sm:shrink-0">
              {/* One bar for the tools: search, view, New folder; dividers between. Upload is the
                  only filled control and sits beside it at the same height and radius. */}
              <div className="flex items-center h-9 flex-1 min-w-0 sm:flex-none rounded-full border border-line bg-white divide-x divide-line" role="toolbar" aria-label="Files">
                <label className="relative flex-1 min-w-0 sm:flex-none h-full">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search"
                    aria-label="Search files"
                    className="h-full w-full sm:w-44 rounded-l-full bg-transparent pl-9 pr-3 text-sm outline-none"
                    data-testid="search"
                  />
                </label>
                <span className="hidden sm:inline-flex items-center h-full px-1.5 gap-0.5" role="group" aria-label="View">
                  <button className={`size-7 inline-flex items-center justify-center rounded-md ${view === "list" ? "text-ink" : "text-ink-3 hover:text-ink-2"}`} onClick={() => chooseView("list")} aria-pressed={view === "list"} aria-label="List" title="List" data-testid="view-list">
                    <LayoutList size={16} />
                  </button>
                  <span className="h-4 w-px bg-line mx-1" aria-hidden />
                  <button className={`size-7 inline-flex items-center justify-center rounded-md ${view === "grid" ? "text-ink" : "text-ink-3 hover:text-ink-2"}`} onClick={() => chooseView("grid")} aria-pressed={view === "grid"} aria-label="Grid" title="Grid" data-testid="view-grid">
                    <LayoutGrid size={16} />
                  </button>
                </span>
                <button className="inline-flex items-center gap-1.5 h-full px-3.5 rounded-r-full text-sm text-ink-2 hover:text-ink hover:bg-cream-2 whitespace-nowrap" onClick={newFolder} aria-label="New folder" title="New folder" data-testid="new-folder">
                  <FolderPlus size={15} /> <span className="hidden md:inline">New folder</span>
                </button>
              </div>
              {/* On a phone the job is its own camera roll; Add is the floating button below. */}
              <span className="hidden pointer-coarse:contents">
                <Link href="/m" className="btn-ghost h-9 py-0 px-4 rounded-full border border-line text-ink text-sm whitespace-nowrap" data-testid="toolbar-photos">
                  {folder === "Phone photos" ? "Back up new photos" : "Back up photos"}
                </Link>
              </span>
              <span className="contents pointer-coarse:hidden">
                {/* .btn-primary is unlayered CSS, so utility classes can't shrink it; inline style can. */}
                <button
                  className="btn-primary text-sm inline-flex items-center gap-1.5"
                  style={{ height: "2.25rem", padding: "0 1rem", borderRadius: "9999px" }}
                  onClick={() => inputRef.current?.click()}
                  data-testid="upload"
                  disabled={!!busy}
                >
                  {busy ? (
                    "Working…"
                  ) : (
                    <>
                      <Upload size={15} /> Upload
                    </>
                  )}
                </button>
              </span>
            </div>
          )}
        </div>
        )}

        {!empty && files && tab === "drive" && (
          <button
            className="hidden pointer-coarse:flex fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] max-sm:bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-30 size-14 items-center justify-center rounded-full bg-ink text-white text-3xl leading-none shadow-lg active:scale-95 transition disabled:opacity-50"
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

        {empty && tab === "drive" && (
          <>
            <SetupSteps state={setupState} big onStart={openMove} providers={{ dropbox: !!me?.providers?.dropbox?.enabled, onedrive: !!me?.providers?.onedrive?.enabled }} />
            <p className="mt-6 text-ink-2">
              Or just{" "}
              <button className="underline underline-offset-4" onClick={() => inputRef.current?.click()} data-testid="tile-upload">
                add a file
              </button>
              , drag one onto this page, or{" "}
              <button className="underline underline-offset-4" onClick={addSample} data-testid="add-sample">
                add a sample file
              </button>{" "}
              to see how it works.
            </p>
          </>
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

        {!empty && files && tab === "drive" && (
          <FileBrowser
            files={all}
            extraFolders={extraFolders}
            folder={folder}
            search={search}
            view={view}
            local={local}
            opening={opening}
            selected={selected}
            onSelect={setSelected}
            onOpenFolder={(p) => {
              setSearch("");
              setSelected(new Set());
              setFolder(p);
            }}
            onOpen={(f) => openAny(f, all)}
            onDownload={(f) => open(f, true)}
            onLocal={(f, keep) => setLocalMany([f], keep)}
            onRename={rename}
            onTrash={trash}
            onMoveTo={(ids) => setMoveIds(ids)}
            onDropMove={moveFiles}
            selectionBar={selectionBar}
            onShare={me?.protection === "passcode" ? undefined : (f) => setShareFile(f)}
          />
        )}
        {moveIds && <MoveDialog folders={allFolders} count={moveIds.length} current={folder} onMove={(target) => moveFiles(moveIds, target)} onClose={() => setMoveIds(null)} />}
        {shareFile && <ShareDialog f={shareFile} onClose={() => setShareFile(null)} onChanged={refresh} />}
        {lightbox && <Lightbox items={lightbox.items} index={lightbox.index} from={lightbox.from} locate={originFor} onIndex={(i) => setLightbox((s) => s && { ...s, index: i })} onClose={() => setLightbox(null)} onDownload={(f) => open(f, true)} />}
        {/* Room under the last row so the floating + never covers its menu. */}
        {!empty && files && <div className="hidden pointer-coarse:block h-20" aria-hidden />}
      </div>

      {dragging && (
        <div className="fixed inset-0 bg-white/90 border-2 border-ink m-3 rounded-2xl flex items-center justify-center pointer-events-none">
          <p className="text-2xl font-semibold">Drop to add</p>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 pointer-coarse:bottom-24 max-sm:bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] max-sm:pointer-coarse:bottom-[calc(env(safe-area-inset-bottom)+9.5rem)] max-w-[calc(100vw-2rem)] left-1/2 -translate-x-1/2 bg-ink text-cream px-5 py-3 rounded-full shadow-lg rise flex items-center gap-4" role="status">
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
        real={providerReady(provider)}
        label={PROVIDER_LABEL[provider]}
        onClose={() => {
          setMigrateOpen(false);
          // One-time reassurance when they leave the dialog mid-copy.
          if (migration.phase === "copying" || migration.phase === "scanning" || migration.phase === "waiting")
            setToast({ text: copyWhere === "server" ? "The copy carries on even if you close Stash." : "Keep using your drive. The copy continues in the background." });
        }}
        onStart={startMigration}
        onStop={providerReady(provider) ? stopCopy : undefined}
        onReconnect={providerReady(provider) ? () => (location.href = providerEndpoints(provider).auth) : undefined}
        where={copyWhere}
        onSwitchAccount={
          providerReady(provider)
            ? async () => {
                // Forget the link and copy progress, then go to the provider's account chooser.
                copyCtrl.current?.abort();
                await copyAction(provider, "forget");
                await fetch(providerEndpoints(provider).disconnect, { method: "DELETE" });
                localStorage.removeItem(doneKey(provider));
                location.href = providerEndpoints(provider).auth + (provider === "google-drive" ? "?switch=1" : "");
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
        <button onClick={resetDemo} className="fixed bottom-4 max-sm:bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] right-4 text-xs text-ink-3 hover:text-ink underline" title="Delete every file in this account" data-testid="start-fresh">
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
  label,
  where,
  onGoToFolder,
  onStop,
  onResume,
  onReconnect,
}: {
  s: MigrationStatus;
  activity: CopyEvent | null;
  label: string;
  where: "server" | "browser" | null;
  onGoToFolder: (folder: string) => void;
  onStop?: () => void;
  onResume?: () => void;
  onReconnect?: () => void;
}) {
  // Where the copy runs decides what the person may do meanwhile.
  const whereLine = where === "server" ? "Runs on Stash's servers. You can close this tab or turn the computer off." : where === "browser" ? "Copies on this device while Stash is open. It picks up again whenever you come back." : null;
  if (s.phase === "scanning")
    return (
      <div className="card mb-5 p-4" role="status" data-testid="migration-progress">
        <div className="flex items-center gap-3">
          <span className="inline-block size-4 rounded-full border-2 border-ink-3 border-t-accent animate-spin" aria-hidden />
          <p className="font-medium flex-1">
            {s.resume
              ? `Picking up where it left off · ${s.resume.copiedCount.toLocaleString()} of ${s.resume.total.toLocaleString()} copied`
              : s.total
                ? `Reading your ${label} · ${s.total.toLocaleString()} files found so far`
                : `Reading your ${label}. A large drive takes a few minutes.`}
          </p>
          {onStop && <IconButton label="Stop copy" onClick={onStop} icon="stop" testId="banner-stop" />}
        </div>
        {s.resume && (
          <div className="mt-2 h-1.5 rounded-full bg-cream-2 overflow-hidden">
            <div className="h-full bg-accent transition-all duration-700" style={{ width: `${s.resume.percent}%` }} />
          </div>
        )}
        {whereLine && <p className="mt-2 text-xs text-ink-3">{whereLine}</p>}
      </div>
    );
  if (s.phase === "idle") return null;
  const stopped = s.phase === "stopped";
  const unfinished = s.phase === "done";
  const reconnect = s.phase === "reconnect";
  const notIn = left(s);
  const title = reconnect
    ? `${label} needs your OK again`
    : stopped
      ? "Copy stopped"
      : unfinished
        ? `${notIn.toLocaleString()} ${notIn === 1 ? "file isn't" : "files aren't"} backed up yet`
        : `Copying from ${label}`;
  return (
    <div className="card mb-5 px-4 py-3" role="status" data-testid="migration-progress">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className={`font-medium min-w-0 sm:truncate ${(stopped || unfinished || reconnect) ? "basis-full sm:basis-auto" : "flex-1 sm:flex-none truncate"}`}>
          {title} · {s.copiedCount.toLocaleString()} of {s.total.toLocaleString()}
        </p>
        <p className="ml-auto text-sm text-ink-2 shrink-0 hidden sm:block">
          {fmtBytes(s.copiedBytes)} / {fmtBytes(s.bytes)} · {s.percent}%
        </p>
        {(stopped || unfinished) && onResume && (
          <button className="btn-ghost border border-line text-sm py-1.5 shrink-0" onClick={onResume} data-testid="banner-resume">
            Resume back up
          </button>
        )}
        {reconnect && onReconnect && (
          <button className="btn-ghost border border-line text-sm py-1.5 shrink-0" onClick={onReconnect} data-testid="banner-reconnect">
            Reconnect
          </button>
        )}
        {(s.phase === "copying" || s.phase === "waiting") && onStop && <IconButton label="Stop copy" onClick={onStop} icon="stop" testId="banner-stop" />}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-cream-2 overflow-hidden">
        <div className={`h-full transition-all duration-700 ${stopped || reconnect ? "bg-ink-3" : "bg-accent"}`} style={{ width: `${s.percent}%` }} />
      </div>
      {s.phase === "waiting" ? (
        <p className="mt-2 text-xs text-ink-3" data-testid="copy-waiting">
          {s.note ?? "Waiting to carry on."}
        </p>
      ) : stopped ? (
        <p className="mt-2 text-xs text-ink-3">Nothing is lost. Resume any time.</p>
      ) : reconnect ? (
        <p className="mt-2 text-xs text-ink-3">{label} stopped letting Stash read your files. Allow it again and the copy carries on from here.</p>
      ) : unfinished ? (
        <p className="mt-2 text-xs text-ink-3">
          {s.failed ? `${label} wouldn't hand over ${s.failed === 1 ? "one file" : `${s.failed.toLocaleString()} files`}. Resume tries them again.` : "Resume carries on from here."}
          {s.skipped ? ` ${s.skipped.toLocaleString()} too big to copy.` : ""}
        </p>
      ) : (
        <ActivityFeed e={activity} onGoToFolder={onGoToFolder} />
      )}
      {(s.phase === "copying" || s.phase === "waiting") && whereLine && <p className="mt-1 text-xs text-ink-3">{whereLine}</p>}
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

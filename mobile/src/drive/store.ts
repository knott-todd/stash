// My drive's data, shared by every folder screen on the stack: the catalogue (cached on
// disk so the drive opens instantly and offline), previews (ciphertext on disk, decrypted
// pictures in a small in-memory LRU), files opened or kept on this phone, uploads, and the
// one-line messages at the foot of the screen. Same routes as the website.

import { useSyncExternalStore } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import * as Network from "expo-network";
import { createFolder, createLink, downloadTo, filesRev, forgetFolder, listFiles, listFolders, me, moveFiles, removeLink, renameFile, trashFile, uploadBytes, type Config, type FileRow } from "../api";
import { CHUNK_CIPHER_BYTES, decryptChunk, fromB64, importKey, toB64, type Key } from "../crypto";

export type Who = { fileCount: number; bytes: number; protection: string | null; googleConnected: boolean; maxBytes?: number };
export type Upload = { id: string; name: string; folder: string; progress: number; state: "waiting" | "sending" | "failed"; note?: string; uri: string; mime: string; size: number };
export type Toast = { text: string; action?: { label: string; run: () => void }; ms: number; at: number };

type State = {
  files: FileRow[] | null;
  folders: string[]; // empty folders someone made
  who: Who | null;
  status: "loading" | "ready" | "error";
  checking: boolean; // the thin line while the list is fetched behind the cache
  offline: boolean;
  uploads: Upload[];
  kept: Set<string>;
  opening: string | null;
  toast: Toast | null;
  setupHidden: boolean;
};

let state: State = { files: null, folders: [], who: null, status: "loading", checking: false, offline: false, uploads: [], kept: new Set(), opening: null, toast: null, setupHidden: false };
const subs = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const f of subs) f();
}
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
export const useDrive = () => useSyncExternalStore(subscribe, () => state);
export const driveState = () => state;

// --- Places on disk

const DOC = FileSystem.documentDirectory ?? "";
const CACHE = FileSystem.cacheDirectory ?? "";
const LIST_FILE = DOC + "stash_drive_v1.json";
const PREFS_FILE = DOC + "stash_drive_prefs_v1.json";
const KEPT = DOC + "stash-kept/"; // kept on this phone, survives cache clearing
const CIPHER = CACHE + "stash-files/"; // opened before
const THUMBS = CACHE + "stash-thumbs/";
const OPEN = CACHE + "stash-open/"; // decrypted, only for handing to another app or the lightbox
const OFFLINE_KEY = "stash_drive_key_v1";

async function ensureDirs() {
  for (const d of [KEPT, CIPHER, THUMBS, OPEN]) await FileSystem.makeDirectoryAsync(d, { intermediates: true }).catch(() => {});
}
const exists = async (p: string) => (await FileSystem.getInfoAsync(p).catch(() => ({ exists: false }))).exists;

// --- Start and refresh

let cfg: Config | null = null;
let rev = -1;
let started = false;
let key: Promise<Key | null> | null = null;

export async function startDrive(c: Config) {
  cfg = c;
  if (started) return;
  started = true;
  await ensureDirs();
  try {
    const kept = await FileSystem.readDirectoryAsync(KEPT);
    set({ kept: new Set(kept) });
  } catch {}
  try {
    const prefs = JSON.parse(await FileSystem.readAsStringAsync(PREFS_FILE));
    set({ setupHidden: !!prefs.setupHidden });
  } catch {}
  try {
    const cached = JSON.parse(await FileSystem.readAsStringAsync(LIST_FILE));
    rev = cached.rev ?? -1;
    set({ files: cached.files ?? [], folders: cached.folders ?? [], who: cached.who ?? null, status: "ready" });
  } catch {}
  Network.addNetworkStateListener((n) => {
    if (n.isConnected && n.isInternetReachable !== false && state.offline) {
      refresh().catch(() => {});
      pump();
    }
  });
  await quiet();
}

export async function refresh(): Promise<void> {
  if (!cfg) return;
  const c = cfg;
  set({ checking: state.files !== null });
  try {
    const [w, files, folders, r] = await Promise.all([me(c), listFiles(c), listFolders(c), filesRev(c).catch(() => -1)]);
    const who: Who = { fileCount: w.fileCount ?? files.length, bytes: w.bytes ?? 0, protection: w.protection ?? null, googleConnected: !!w.googleConnected, maxBytes: w.maxBytes };
    if (w.key) SecureStore.setItemAsync(OFFLINE_KEY, w.key).catch(() => {}); // so previews open offline too
    rev = r;
    const pending = new Set(trashing.keys());
    set({ files: files.filter((f) => !pending.has(f.id)), folders, who, status: "ready", offline: false, checking: false });
    FileSystem.writeAsStringAsync(LIST_FILE, JSON.stringify({ files, folders, who, rev })).catch(() => {});
  } catch {
    const net = await Network.getNetworkStateAsync().catch(() => null);
    const off = !net?.isConnected || net.isInternetReachable === false;
    set({ checking: false, offline: state.files !== null && off, status: state.files ? "ready" : "error" });
    if (state.files && !off) throw new Error("unreachable"); // the pull says so; a quiet check does not
  }
}

const quiet = () => refresh().catch(() => {});

// The cheap check on open, on focus and every minute: fetch the list only when it moved.
export async function check() {
  if (!cfg) return;
  try {
    const r = await filesRev(cfg);
    if (r !== rev || state.offline) await quiet();
  } catch {
    await quiet();
  }
}

export function hideSetup() {
  set({ setupHidden: true });
  FileSystem.writeAsStringAsync(PREFS_FILE, JSON.stringify({ setupHidden: true })).catch(() => {});
}

// A photo the backup just finished, shown before the next refresh.
export function addFile(f: FileRow) {
  if (!state.files || state.files.some((x) => x.id === f.id)) return;
  set({ files: [...state.files, f] });
}

// --- The account key, from the session (Locked) or the server (Standard), kept for offline.

function accountKey(): Promise<Key | null> {
  if (!key)
    key = (async () => {
      if (!cfg) return null;
      const raw = cfg.key ?? (await me(cfg).then((w) => w.key ?? null).catch(() => null)) ?? (await SecureStore.getItemAsync(OFFLINE_KEY).catch(() => null));
      return raw ? importKey(raw) : null;
    })().catch(() => null);
  const k = key;
  k.then((v) => {
    if (!v && key === k) key = null; // try again next time
  });
  return k;
}

// --- Folders

export const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
export const nameOf = (p: string) => p.split("/").pop() ?? p;
export const join = (a: string, b: string) => [a, b].filter(Boolean).join("/");

// Every folder: those holding files, their parents, and the empty ones someone made.
export function allFolders(files: FileRow[], extra: string[]): string[] {
  const out = new Set<string>();
  for (const p of [...files.map((f) => f.folder), ...extra])
    if (p) {
      const parts = p.split("/");
      for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join("/"));
    }
  return [...out];
}

// What one folder shows: its subfolders (with how many things are directly inside) and its files.
export function folderView(files: FileRow[], extra: string[], folder: string, hidden: Set<string> = new Set()) {
  const live = files.filter((f) => !hidden.has(f.id));
  const folders = allFolders(live, extra);
  const subs = folders.filter((p) => parentOf(p) === folder);
  const count = (p: string) => live.filter((f) => f.folder === p).length + folders.filter((q) => parentOf(q) === p).length;
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  return {
    folders: subs.sort((a, b) => byName(nameOf(a), nameOf(b))).map((p) => ({ path: p, count: count(p) })),
    files: live.filter((f) => f.folder === folder).sort((a, b) => byName(a.name, b.name)),
  };
}

// Keys in a selection: a file id, or "d:<path>" for a folder (everything inside it).
export function filesForKeys(keys: Iterable<string>): FileRow[] {
  const ks = [...keys];
  const dirs = ks.filter((k) => k.startsWith("d:")).map((k) => k.slice(2));
  return (state.files ?? []).filter((x) => ks.includes(x.id) || dirs.some((d) => x.folder === d || x.folder.startsWith(d + "/")));
}

// --- Messages at the foot of the screen

export function toast(text: string, action?: Toast["action"], ms = action ? 6000 : 4000) {
  set({ toast: { text, action, ms, at: Date.now() } });
}
export const clearToast = () => set({ toast: null });

// --- Changes, optimistic, with the server call behind them

export async function rename(f: FileRow, name: string) {
  if (!cfg || !state.files) return;
  set({ files: state.files.map((x) => (x.id === f.id ? { ...x, name } : x)) });
  try {
    await renameFile(cfg, f.id, name);
  } catch {
    toast(`Couldn't rename ${f.name}.`);
  }
  quiet();
}

// A folder goes into the target with its name and everything under it; a file lands in the target itself.
export async function move(keys: string[], target: string) {
  if (!cfg || !state.files) return;
  const dirs = keys.filter((k) => k.startsWith("d:")).map((k) => k.slice(2));
  if (dirs.some((d) => target === d || target.startsWith(d + "/"))) return toast("A folder can't be moved into itself.");
  const plan = new Map<string, string[]>();
  for (const x of state.files) {
    let dest: string | null = null;
    if (keys.includes(x.id)) dest = target;
    else {
      const d = dirs.find((p) => x.folder === p || x.folder.startsWith(p + "/"));
      if (d) dest = [target, nameOf(d), x.folder.slice(d.length).replace(/^\//, "")].filter(Boolean).join("/");
    }
    if (dest !== null && dest !== x.folder) plan.set(dest, [...(plan.get(dest) ?? []), x.id]);
  }
  // Empty folders that were moved: remember them in their new place.
  const emptyMoves = state.folders.filter((p) => dirs.some((d) => p === d || p.startsWith(d + "/")));
  set({
    files: state.files.map((x) => {
      for (const [dest, ids] of plan) if (ids.includes(x.id)) return { ...x, folder: dest };
      return x;
    }),
  });
  let failed = false;
  for (const [dest, ids] of plan) await moveFiles(cfg, ids, dest).catch(() => (failed = true));
  for (const p of emptyMoves) {
    const d = dirs.find((q) => p === q || p.startsWith(q + "/"))!;
    await createFolder(cfg, [target, nameOf(d), p.slice(d.length).replace(/^\//, "")].filter(Boolean).join("/")).catch(() => {});
  }
  for (const d of dirs) await forgetFolder(cfg, d).catch(() => {});
  toast(failed ? "Couldn't move everything. Try again." : `Moved to ${target ? nameOf(target) : "My drive"}.`);
  quiet();
}

// Trash waits six seconds for Undo before the server is told, as on the web.
const trashing = new Map<string, ReturnType<typeof setTimeout>>();

export function trash(keys: string[]) {
  if (!cfg || !state.files) return;
  const c = cfg;
  const batch = filesForKeys(keys);
  const dirs = keys.filter((k) => k.startsWith("d:")).map((k) => k.slice(2));
  if (!batch.length && !dirs.length) return;
  const emptyBefore = state.folders;
  set({ files: state.files.filter((x) => !batch.some((b) => b.id === x.id)), folders: state.folders.filter((p) => !dirs.some((d) => p === d || p.startsWith(d + "/"))) });
  const t = setTimeout(async () => {
    let failed = 0;
    for (const x of batch) {
      trashing.delete(x.id);
      await trashFile(c, x.id).catch(() => failed++);
    }
    for (const d of dirs) await forgetFolder(c, d).catch(() => {});
    if (failed) toast(failed === 1 ? `Couldn't delete ${batch[0].name}.` : `Couldn't delete ${failed} files.`);
    quiet();
  }, 6000);
  for (const x of batch) trashing.set(x.id, t);
  const one = keys.length === 1;
  const label = one ? (keys[0].startsWith("d:") ? nameOf(keys[0].slice(2)) : batch[0]?.name ?? "") : "";
  const text = one ? `${label} moved to trash.` : `${batch.length.toLocaleString()} ${batch.length === 1 ? "file" : "files"} moved to trash.`;
  toast(text, {
    label: "Undo",
    run: () => {
      clearTimeout(t);
      for (const x of batch) trashing.delete(x.id);
      set({ files: [...(state.files ?? []), ...batch.filter((b) => !state.files?.some((x) => x.id === b.id))], folders: emptyBefore });
      clearToast();
      quiet();
    },
  });
}

export async function newFolder(parent: string, name: string): Promise<string | null> {
  if (!cfg) return null;
  const path = join(parent, name.trim().replace(/\//g, " "));
  try {
    const p = await createFolder(cfg, path);
    if (!state.folders.includes(p)) set({ folders: [...state.folders, p] });
    return p;
  } catch {
    toast("Couldn't make that folder.");
    return null;
  }
}

export async function linkFor(f: FileRow): Promise<string> {
  if (!cfg) throw new Error("no session");
  const url = await createLink(cfg, f.id);
  if (state.files) set({ files: state.files.map((x) => (x.id === f.id ? { ...x, shared: true } : x)) });
  return url;
}
export async function unlink(f: FileRow) {
  if (!cfg) return;
  await removeLink(cfg, f.id);
  if (state.files) set({ files: state.files.map((x) => (x.id === f.id ? { ...x, shared: false } : x)) });
}

// --- File contents on this phone

async function cipherPath(f: FileRow): Promise<string> {
  if (state.kept.has(f.id)) return KEPT + f.id;
  const p = CIPHER + f.id;
  if (await exists(p)) return p;
  if (!cfg) throw new Error("no session");
  await downloadTo(cfg, f.id, p + ".part");
  await FileSystem.moveAsync({ from: p + ".part", to: p });
  return p;
}

// Read and decrypt piece by piece, so a large file never sits in memory as one base64 string.
async function decryptPath(k: Key, path: string, chunked: boolean): Promise<Uint8Array> {
  if (!chunked) return decryptChunk(k, fromB64(await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 })));
  const info = await FileSystem.getInfoAsync(path);
  const size = info.exists ? info.size : 0;
  const parts: Uint8Array[] = [];
  let total = 0;
  for (let off = 0; off < size; off += CHUNK_CIPHER_BYTES) {
    const b64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64, position: off, length: Math.min(CHUNK_CIPHER_BYTES, size - off) });
    const p = await decryptChunk(k, fromB64(b64));
    parts.push(p);
    total += p.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const safeName = (n: string) => n.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) || "file";

// The file, decrypted into a temporary place another app (or the lightbox) can read.
export async function plainFile(f: FileRow): Promise<string> {
  if (!f.stored) throw new Error("placeholder");
  const dir = OPEN + f.id + "/";
  const out = dir + safeName(f.name);
  if (await exists(out)) return out;
  const src = await cipherPath(f);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  if (!f.encrypted) {
    await FileSystem.copyAsync({ from: src, to: out });
    return out;
  }
  const k = await accountKey();
  if (!k) throw new Error("no key");
  const plain = await decryptPath(k, src, !!f.chunked);
  await FileSystem.writeAsStringAsync(out, toB64(plain), { encoding: FileSystem.EncodingType.Base64 });
  return out;
}

export async function keep(f: FileRow) {
  try {
    const src = await cipherPath(f);
    if (src !== KEPT + f.id) await FileSystem.copyAsync({ from: src, to: KEPT + f.id });
    set({ kept: new Set(state.kept).add(f.id) });
  } catch {
    toast(`Couldn't keep ${f.name} on this phone.`);
  }
}
export async function unkeep(f: FileRow) {
  await FileSystem.deleteAsync(KEPT + f.id, { idempotent: true }).catch(() => {});
  const kept = new Set(state.kept);
  kept.delete(f.id);
  set({ kept });
}

export const setOpening = (id: string | null) => set({ opening: id });

// --- Previews: ciphertext on disk, decrypted pictures in memory (a small LRU of data URIs).

const LRU_MAX = 200;
const lru = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const FALLBACK_MAX = 4_000_000; // older one-piece pictures without a stored preview: show the picture itself
let slots = 0;
const waiters: (() => void)[] = [];
const slot = () => new Promise<void>((res) => (slots < 3 ? (slots++, res()) : waiters.push(() => (slots++, res()))));
const release = () => {
  slots--;
  waiters.shift()?.();
};

export const isPicture = (f: FileRow) => f.mime.startsWith("image/");
export const isVideo = (f: FileRow) => f.mime.startsWith("video/");
export const hasPreview = (f: FileRow) => !!f.thumb || (isPicture(f) && !!f.stored && !f.chunked && f.size <= FALLBACK_MAX);

export function cachedThumb(id: string) {
  const v = lru.get(id);
  if (v) {
    lru.delete(id);
    lru.set(id, v);
  }
  return v ?? null;
}

export function thumb(f: FileRow): Promise<string | null> {
  const hit = cachedThumb(f.id);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(f.id);
  if (running) return running;
  if (!hasPreview(f)) return Promise.resolve(null);
  const p = (async () => {
    await slot();
    try {
      const k = await accountKey();
      if (!k) return null;
      let plain: Uint8Array;
      let mime = "image/jpeg";
      if (f.thumb) {
        const path = THUMBS + f.id;
        if (!(await exists(path))) {
          if (!cfg) return null;
          await downloadTo(cfg, f.id, path + ".part", "thumb");
          await FileSystem.moveAsync({ from: path + ".part", to: path });
        }
        plain = await decryptPath(k, path, false);
      } else {
        plain = await decryptPath(k, await cipherPath(f), false);
        mime = f.mime;
      }
      const uri = `data:${mime};base64,${toB64(plain)}`;
      lru.set(f.id, uri);
      while (lru.size > LRU_MAX) lru.delete(lru.keys().next().value!);
      return uri;
    } catch {
      return null;
    } finally {
      release();
      inflight.delete(f.id);
    }
  })();
  inflight.set(f.id, p);
  return p;
}

// --- Uploads: one at a time, each a row with a ring; they wait while offline.

let pumping = false;
export function enqueueUploads(items: { uri: string; name: string; mime: string; size: number }[], folder: string) {
  const max = state.who?.maxBytes ?? 4 * 1024 * 1024 * 1024;
  const ok: Upload[] = [];
  for (const it of items) {
    if (it.size > max) {
      toast(`${it.name} is over ${Math.round(max / 1024 / 1024).toLocaleString()} MB. Files that big aren't supported yet.`);
      continue;
    }
    ok.push({ ...it, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, folder, progress: 0, state: "waiting" });
  }
  if (!ok.length) return;
  set({ uploads: [...state.uploads, ...ok] });
  pump();
}

function patchUpload(id: string, patch: Partial<Upload>) {
  set({ uploads: state.uploads.map((u) => (u.id === id ? { ...u, ...patch } : u)) });
}

export function retryUpload(id: string) {
  patchUpload(id, { state: "waiting", progress: 0, note: undefined });
  pump();
}

async function pump() {
  if (pumping || !cfg) return;
  pumping = true;
  try {
    for (;;) {
      const u = state.uploads.find((x) => x.state === "waiting");
      if (!u || state.offline) break;
      patchUpload(u.id, { state: "sending", progress: 0.02 });
      try {
        const k = await accountKey();
        if (!k) throw new Error("no key");
        const bytes = fromB64(await FileSystem.readAsStringAsync(u.uri, { encoding: FileSystem.EncodingType.Base64 }));
        patchUpload(u.id, { progress: 0.1 });
        const file: FileRow = await uploadBytes(cfg, k, bytes, { name: u.name, mime: u.mime || "application/octet-stream", folder: u.folder }, undefined, "phone", (fr) => patchUpload(u.id, { progress: 0.1 + fr * 0.9 }));
        set({ uploads: state.uploads.filter((x) => x.id !== u.id) });
        if (file) addFile(file);
        toast("Safe. Encrypted on this device before it left.");
      } catch (e) {
        // Messages the server writes for people ("Storage is busy…") are shown as they are.
        const m = /"error":"([^"]+)"/.exec(String((e as Error).message))?.[1];
        patchUpload(u.id, { state: "failed", note: m ?? `Couldn't upload ${u.name}. Check your connection.` });
      }
    }
  } finally {
    pumping = false;
    quiet();
  }
}

// The Photos timeline (docs/phone/03-photos.md): Stash's pictures and videos plus this phone's,
// each picture once, newest first by date taken, laid out as day headers and rows of square
// tiles with every offset known in advance, so the list never measures and can jump anywhere.
// This phone's camera roll is indexed here and cached on disk, so later opens paint at once.

import { useSyncExternalStore } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { settingsOf, type Config, type FileRow } from "../api";

export type LocalAsset = { id: string; uri: string; name: string; t: number; video: boolean };
// One tile: a Stash file (with its copy on this phone, when there is one) or a phone picture not in Stash.
export type Item = { key: string; t: number; video: boolean; file?: FileRow; local?: LocalAsset; pending: boolean };
export type Cols = 3 | 4 | 6;

const DOC = FileSystem.documentDirectory ?? "";
const INDEX_FILE = DOC + "stash_photos_local_v1.json";
const PREFS_FILE = DOC + "stash_photos_prefs_v1.json";
const LINKS_FILE = DOC + "stash_photos_links_v1.json"; // phone picture -> its Stash file, where names can't tell
const DONE_FILE = DOC + "stash_done_assets_v1"; // written by ../backup: the phone pictures already sent

type State = { assets: LocalAsset[] | null; done: Set<string>; links: Record<string, string>; permission: boolean | null; cols: Cols; scrubbing: boolean };
let state: State = { assets: null, done: new Set(), links: {}, permission: null, cols: 4, scrubbing: false };
const subs = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const f of subs) f();
}
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
export const usePhotos = () => useSyncExternalStore(subscribe, () => state);
export const photosState = () => state;
export const useScrubbing = () => useSyncExternalStore(subscribe, () => state.scrubbing); // tiles re-render only when this flips

// --- This phone's camera roll

let loaded = false;
let lastScan = 0;
let scanning = false;

export async function startLocal(cfg: Config) {
  if (!loaded) {
    loaded = true;
    try {
      const p = JSON.parse(await FileSystem.readAsStringAsync(PREFS_FILE));
      if ([3, 4, 6].includes(p.cols)) set({ cols: p.cols });
    } catch {}
    try {
      set({ links: JSON.parse(await FileSystem.readAsStringAsync(LINKS_FILE)) ?? {} });
    } catch {}
    try {
      set({ assets: JSON.parse(await FileSystem.readAsStringAsync(INDEX_FILE)) ?? [] });
    } catch {}
  }
  const perm = await MediaLibrary.getPermissionsAsync(false, ["photo", "video"]).catch(() => null);
  const granted = !!perm?.granted;
  set({ permission: granted });
  if (!granted) return set({ assets: [] });
  await readDone();
  if (Date.now() - lastScan > 60_000) scan(cfg).catch(() => {});
}

export async function readDone() {
  try {
    set({ done: new Set(JSON.parse(await FileSystem.readAsStringAsync(DONE_FILE))) });
  } catch {}
}

// The whole roll, newest first, in pages: what backup would send (videos only when they're on).
async function scan(cfg: Config) {
  if (scanning) return;
  scanning = true;
  try {
    const videos = settingsOf(cfg).videos;
    const out: LocalAsset[] = [];
    let after: string | undefined;
    for (;;) {
      const page = await MediaLibrary.getAssetsAsync({ mediaType: videos ? ["photo", "video"] : ["photo"], sortBy: [["creationTime", false]], first: 1000, after });
      for (const a of page.assets) out.push({ id: a.id, uri: a.uri, name: a.filename, t: a.creationTime || a.modificationTime || 0, video: a.mediaType === "video" });
      if (!page.hasNextPage) break;
      after = page.endCursor;
    }
    lastScan = Date.now();
    set({ assets: out });
    FileSystem.writeAsStringAsync(INDEX_FILE, JSON.stringify(out)).catch(() => {});
  } finally {
    scanning = false;
  }
}
export const rescan = (cfg: Config) => {
  lastScan = 0;
  return scan(cfg).catch(() => {});
};

// A Stash file just saved into the camera roll: the new phone picture is that file, so it shows
// once and backup does not send it back.
export async function linkSaved(asset: MediaLibrary.Asset, fileId: string) {
  const links = { ...state.links, [asset.id]: fileId };
  const done = new Set(state.done).add(asset.id);
  set({ links, done });
  FileSystem.writeAsStringAsync(LINKS_FILE, JSON.stringify(links)).catch(() => {});
  try {
    const onDisk: string[] = JSON.parse(await FileSystem.readAsStringAsync(DONE_FILE).catch(() => "[]"));
    if (!onDisk.includes(asset.id)) await FileSystem.writeAsStringAsync(DONE_FILE, JSON.stringify([...onDisk, asset.id]));
  } catch {}
}

export function setCols(cols: Cols) {
  set({ cols });
  FileSystem.writeAsStringAsync(PREFS_FILE, JSON.stringify({ cols })).catch(() => {});
}
export const setScrubbing = (scrubbing: boolean) => state.scrubbing !== scrubbing && set({ scrubbing });

// --- The timeline

export const isMedia = (f: FileRow) => !!f.stored && (f.mime.startsWith("image/") || f.mime.startsWith("video/"));
export const when = (f: FileRow) => f.modifiedAt ?? f.createdAt;

// A backed-up phone picture is its Stash copy: backup sends it under its own name and date taken.
export function buildTimeline(files: FileRow[], local: LocalAsset[], done: Set<string>, links: Record<string, string>): Item[] {
  const media = files.filter(isMedia);
  const byId = new Map(media.map((f) => [f.id, f]));
  const byNameTime = new Map<string, FileRow>();
  for (const f of media) if (f.modifiedAt) byNameTime.set(`${f.name}|${f.modifiedAt}`, f);
  const onPhone = new Map<string, LocalAsset>();
  const out: Item[] = [];
  for (const a of local) {
    const f = (links[a.id] && byId.get(links[a.id])) || byNameTime.get(`${a.name}|${a.t}`);
    if (f && !onPhone.has(f.id)) onPhone.set(f.id, a);
    else if (!f) out.push({ key: "local:" + a.id, t: a.t, video: a.video, local: a, pending: !done.has(a.id) });
  }
  for (const f of media) out.push({ key: f.id, t: when(f), video: f.mime.startsWith("video/"), file: f, local: onPhone.get(f.id), pending: false });
  return out.sort((a, b) => b.t - a.t || (a.key < b.key ? -1 : 1));
}

// The viewer speaks FileRow; a phone picture not yet in Stash gets a stand-in.
export function asFileRow(it: Item): FileRow {
  if (it.file) return it.file;
  const a = it.local!;
  const mime = a.video ? "video/mp4" : /\.png$/i.test(a.name) ? "image/png" : /\.heic$/i.test(a.name) ? "image/heic" : "image/jpeg";
  return { id: it.key, name: a.name, size: 0, mime, folder: "", source: "phone", createdAt: a.t, modifiedAt: a.t, stored: false };
}

// --- Dates, in words

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function dayLabel(t: number, now = new Date()): string {
  const d = new Date(t);
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) return DAYS[d.getDay()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? "" : " " + d.getFullYear()}`;
}
export const monthLabel = (t: number) => {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
// "Saturday, 3 March 2025 · 14:22", the viewer's top bar.
export function fullWhen(t: number) {
  const d = new Date(t);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${hm}`;
}
const dayKey = (t: number) => {
  const d = new Date(t);
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
};

// --- Layout: every row's height and offset, computed, never measured.

export const GAP = 2;
export const HEADER_H = 52;
export type Row = { kind: "h"; key: string; label: string; first: number; n: number } | { kind: "r"; key: string; first: number; n: number };
export type Layout = { rows: Row[]; offsets: number[]; heights: number[]; headerOf: number[]; total: number; tile: number; cols: number; months: { label: string; offset: number }[] };

export function layout(items: Item[], cols: number, width: number): Layout {
  const tile = Math.floor((width - GAP * (cols - 1)) / cols);
  const rows: Row[] = [];
  const offsets: number[] = [];
  const heights: number[] = [];
  const headerOf: number[] = [];
  const months: Layout["months"] = [];
  const now = new Date();
  let y = 0;
  let i = 0;
  while (i < items.length) {
    const k = dayKey(items[i].t);
    let j = i;
    while (j < items.length && dayKey(items[j].t) === k) j++;
    const h = rows.length;
    const month = monthLabel(items[i].t);
    if (!months.length || months[months.length - 1].label !== month) months.push({ label: month, offset: y });
    rows.push({ kind: "h", key: "h" + k, label: dayLabel(items[i].t, now), first: i, n: j - i });
    offsets.push(y);
    heights.push(HEADER_H);
    headerOf.push(h);
    y += HEADER_H;
    for (let r = i; r < j; r += cols) {
      rows.push({ kind: "r", key: items[r].key, first: r, n: Math.min(cols, j - r) });
      offsets.push(y);
      heights.push(tile + GAP);
      headerOf.push(h);
      y += tile + GAP;
    }
    i = j;
  }
  return { rows, offsets, heights, headerOf, total: y, tile, cols, months };
}

// The row at a content offset (binary search over the offsets).
export function rowAt(l: Layout, y: number): number {
  let lo = 0;
  let hi = l.offsets.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (l.offsets[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// The row that holds a timeline index.
export function rowOfItem(l: Layout, index: number): number {
  let lo = 0;
  let hi = l.rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (l.rows[mid].first <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// The tile under a point of the grid's content, or -1.
export function itemAt(l: Layout, x: number, y: number): number {
  const r = rowAt(l, y);
  const row = l.rows[r];
  if (!row || row.kind !== "r") return -1;
  const c = Math.min(l.cols - 1, Math.max(0, Math.floor(x / (l.tile + GAP))));
  return c < row.n ? row.first + c : -1;
}

export function monthAt(l: Layout, y: number) {
  let best = l.months[0];
  for (const m of l.months) {
    if (m.offset <= y) best = m;
    else break;
  }
  return best;
}

// "photos", "videos" or "photos and videos", and the singular for one.
export function noun(n: number, kinds: { photos: number; videos: number }) {
  if (n === 1) return kinds.videos && !kinds.photos ? "video" : "photo";
  if (kinds.videos && !kinds.photos) return "videos";
  if (kinds.videos) return "photos and videos";
  return "photos";
}

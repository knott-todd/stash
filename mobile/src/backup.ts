// The job: every photo and video in the camera roll that isn't in Stash yet,
// newest first, encrypted and sent. Runs when the app is open and, as far as
// the OS allows, in the background (expo-background-task: iOS runs it when it
// sees fit, roughly a few times a day; Android about every 15 minutes).

import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import { loadConfig, me, report, uploadBytes } from "./api";
import { importKey } from "./crypto";

export const TASK = "com.olusanyatodd.stash.backup";
const DONE_KEY = "stash_done_assets_v1";
const FOLDER = "Phone photos";

async function doneSet(): Promise<Set<string>> {
  try {
    const raw = await FileSystem.readAsStringAsync(FileSystem.documentDirectory + DONE_KEY);
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}
async function saveDone(s: Set<string>) {
  await FileSystem.writeAsStringAsync(FileSystem.documentDirectory + DONE_KEY, JSON.stringify([...s]));
}

export type Progress = { total: number; done: number; pending: number; failed: number; current?: string };

export async function runBackup(onProgress: (p: Progress) => void = () => {}, budgetMs = 25_000): Promise<Progress> {
  const started = Date.now();
  const cfg = await loadConfig();
  if (!cfg.token) throw new Error("unlinked");
  const who = await me(cfg);
  const raw = who.key ?? cfg.key;
  if (!raw) throw new Error("locked"); // the app asks for the passcode in the foreground
  const key = await importKey(raw);
  const perm = await MediaLibrary.getPermissionsAsync();
  if (!perm.granted) throw new Error("no-permission");

  const done = await doneSet();
  const all: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await MediaLibrary.getAssetsAsync({ mediaType: ["photo", "video"], sortBy: [["creationTime", false]], first: 500, after });
    all.push(...page.assets);
    if (!page.hasNextPage) break;
    after = page.endCursor;
  }
  const queue = all.filter((a) => !done.has(a.id));
  const p: Progress = { total: all.length, done: all.length - queue.length, pending: queue.length, failed: 0 };
  onProgress(p);
  await report(cfg, { status: queue.length ? "uploading" : "idle", folders: [{ path: "Camera roll", label: "Camera roll", files: all.length, bytes: 0, pending: queue.length, failed: 0 }], version: "0.1.0" });

  for (const a of queue) {
    if (Date.now() - started > budgetMs) break; // the OS gives background work a short window
    p.current = a.filename;
    onProgress({ ...p });
    try {
      const info = await MediaLibrary.getAssetInfoAsync(a);
      const uri = info.localUri ?? a.uri;
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = Uint8Array.from(globalThis.atob(b64), (c) => c.charCodeAt(0));
      const mime = a.mediaType === "video" ? "video/mp4" : /\.heic$/i.test(a.filename) ? "image/heic" : /\.png$/i.test(a.filename) ? "image/png" : "image/jpeg";
      await uploadBytes(cfg, key, bytes, { name: a.filename, mime, folder: FOLDER, modifiedAt: a.creationTime || undefined });
      done.add(a.id);
      await saveDone(done);
      p.done++;
      p.pending--;
    } catch {
      p.failed++;
      p.pending--;
    }
    onProgress({ ...p });
  }
  await report(cfg, { status: p.pending ? "uploading" : "idle", folders: [{ path: "Camera roll", label: "Camera roll", files: p.total, bytes: 0, pending: p.pending, failed: p.failed, lastUpload: Date.now() }], version: "0.1.0" });
  return p;
}

TaskManager.defineTask(TASK, async () => {
  try {
    await runBackup(() => {}, 20_000);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function scheduleBackground() {
  await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
}

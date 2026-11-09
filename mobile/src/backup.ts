// The job: every photo and video in the camera roll that isn't in Stash yet,
// newest first, encrypted and sent. Runs when the app is open and, as far as
// the OS allows, in the background (expo-background-task: iOS runs it when it
// sees fit, roughly a few times a day; Android about every 15 minutes).
// The person's rules come first: Wi-Fi only and charging only are on by default,
// because data costs money and a first backup can drain a battery.

import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import * as Network from "expo-network";
import * as Battery from "expo-battery";
import { loadConfig, me, report, saveConfig, settingsOf, uploadBytes, type Config } from "./api";
import { importKey } from "./crypto";
import { backupNews } from "./events";

export const TASK = "com.olusanyatodd.stash.backup";
const DONE_KEY = "stash_done_assets_v1";
const FOLDER = "Phone photos";
export const VERSION = "0.2.0";

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

export type Progress = { total: number; done: number; pending: number; failed: number; current?: string; waitingFor?: "wifi" | "charging" | null };

// Why the phone is not sending right now, or null when it may.
export async function holdReason(c: Config): Promise<"wifi" | "charging" | null> {
  const s = settingsOf(c);
  if (s.wifiOnly) {
    const n = await Network.getNetworkStateAsync().catch(() => null);
    if (n && n.isConnected && n.type !== Network.NetworkStateType.WIFI && n.type !== Network.NetworkStateType.ETHERNET) return "wifi";
  }
  if (s.chargingOnly) {
    const b = await Battery.getBatteryStateAsync().catch(() => Battery.BatteryState.UNKNOWN);
    if (b === Battery.BatteryState.UNPLUGGED) return "charging";
  }
  return null;
}

// What the camera roll holds and what is still to send, without sending anything.
export async function census(c: Config): Promise<Progress> {
  const s = settingsOf(c);
  const done = await doneSet();
  const all = await listAssets(s.videos);
  const pending = all.filter((a) => !done.has(a.id)).length;
  return { total: all.length, done: all.length - pending, pending, failed: 0, waitingFor: pending ? await holdReason(c) : null };
}

async function listAssets(videos: boolean) {
  const all: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await MediaLibrary.getAssetsAsync({ mediaType: videos ? ["photo", "video"] : ["photo"], sortBy: [["creationTime", false]], first: 500, after });
    all.push(...page.assets);
    if (!page.hasNextPage) break;
    after = page.endCursor;
  }
  return all;
}

// Send what is waiting. `force` ignores the Wi-Fi and charging rules (the person pressed Check now).
export async function runBackup(onProgress: (p: Progress) => void = () => {}, budgetMs = 25_000, force = false): Promise<Progress> {
  const started = Date.now();
  const cfg = await loadConfig();
  if (!cfg.token) throw new Error("unlinked");
  const who = await me(cfg);
  const raw = who.key ?? cfg.key;
  if (!raw) throw new Error("locked"); // the app asks for the passcode in the foreground
  const key = await importKey(raw).catch((e) => {
    throw new Error(`key: ${(e as Error).message}`);
  });
  const perm = await MediaLibrary.getPermissionsAsync(false, ["photo", "video"]);
  if (!perm.granted) throw new Error("no-permission");
  const settings = settingsOf(cfg);

  const done = await doneSet();
  const all = await listAssets(settings.videos);
  const queue = all.filter((a) => !done.has(a.id));
  const p: Progress = { total: all.length, done: all.length - queue.length, pending: queue.length, failed: 0, waitingFor: null };
  if (queue.length && !force) {
    p.waitingFor = await holdReason(cfg);
    if (p.waitingFor) {
      onProgress(p);
      return p;
    }
  }
  onProgress(p);
  await report(cfg, { status: queue.length ? "uploading" : "idle", folders: [{ path: "Camera roll", label: "Camera roll", files: all.length, bytes: 0, pending: queue.length, failed: 0 }], version: VERSION });

  if (queue.length) backupNews.set({ sending: true });
  for (const a of queue) {
    if (Date.now() - started > budgetMs) break; // the OS gives background work a short window
    p.current = a.filename;
    onProgress({ ...p });
    try {
      // The asset's content URI reads directly on Android; fall back to the resolved file for the odd one that does not.
      let b64: string;
      try {
        b64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
      } catch {
        const info = await MediaLibrary.getAssetInfoAsync(a);
        b64 = await FileSystem.readAsStringAsync(info.localUri ?? a.uri, { encoding: FileSystem.EncodingType.Base64 });
      }
      const bytes = Uint8Array.from(globalThis.atob(b64), (c) => c.charCodeAt(0));
      const mime = a.mediaType === "video" ? "video/mp4" : /\.heic$/i.test(a.filename) ? "image/heic" : /\.png$/i.test(a.filename) ? "image/png" : "image/jpeg";
      const sent = await uploadBytes(cfg, key, bytes, { name: a.filename, mime, folder: FOLDER, modifiedAt: a.creationTime || undefined });
      backupNews.set({ sending: true, last: sent }); // Phone photos fills in as it goes
      done.add(a.id);
      await saveDone(done);
      p.done++;
      p.pending--;
    } catch (e) {
      console.log("backup: failed", a.filename, String((e as Error).message));
      p.failed++;
      p.pending--;
    }
    onProgress({ ...p });
  }
  delete p.current;
  backupNews.set({ sending: false });
  const fresh = await loadConfig();
  await saveConfig({ ...fresh, lastRun: { at: Date.now(), total: p.total, done: p.done, pending: p.pending, failed: p.failed } });
  await report(cfg, { status: p.pending ? "uploading" : "idle", folders: [{ path: "Camera roll", label: "Camera roll", files: p.total, bytes: 0, pending: p.pending, failed: p.failed, lastUpload: Date.now() }], version: VERSION });
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

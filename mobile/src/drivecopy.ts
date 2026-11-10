// Move my files here, on the phone: list the connected Google Drive through the server,
// then copy each file (download through the server, encrypt here, send) while the app
// is open. What has been copied is remembered, so a stopped copy resumes without
// duplicates. Honest limits: no promise to finish unattended; Android may pause it.

import * as FileSystem from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";
import { loadConfig, saveConfig, uploadBytes, type Config } from "./api";
import { importKey, fromB64 } from "./crypto";
import { copyNews } from "./events";

type Listed = { id: string; name: string; size: number; mimeType: string; folder: string; exportAs?: string };
export type CopyState = { phase: "idle" | "scanning" | "copying" | "paused" | "done"; total: number; copied: number; failed: number; current?: string; bytes?: number };

const auth = (c: Config) => ({ authorization: `Bearer ${c.token}` });
const DONE_FILE = "stash_gdrive_done_v1";

async function doneSet(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse(await FileSystem.readAsStringAsync(FileSystem.documentDirectory + DONE_FILE)));
  } catch {
    return new Set();
  }
}
const saveDone = (s: Set<string>) => FileSystem.writeAsStringAsync(FileSystem.documentDirectory + DONE_FILE, JSON.stringify([...s]));

// Connect Google Drive: a one-time handoff code stands in for the phone's token in the
// browser tab Google needs; the result comes back as stash://drive-connected?result=…
export async function connectGoogleDrive(c: Config): Promise<"ok" | "denied" | "failed" | "expired" | "cancelled"> {
  const r = await fetch(`${c.server}/api/auth/handoff`, { method: "POST", headers: auth(c) });
  if (!r.ok) throw new Error("Couldn't start. Try again.");
  const { code } = await r.json();
  const res = await WebBrowser.openAuthSessionAsync(`${c.server}/api/google/auth?handoff=${encodeURIComponent(code)}`, "stash://drive-connected", { showInRecents: true });
  if (res.type !== "success") return "cancelled";
  const result = new URL(res.url).searchParams.get("result");
  return result === "ok" ? "ok" : result === "denied" ? "denied" : result === "expired" ? "expired" : "failed";
}

export async function isGoogleConnected(c: Config) {
  const j = await fetch(`${c.server}/api/me`, { headers: auth(c) }).then((r) => r.json());
  return !!j.googleConnected;
}

let running = false;
export async function runDriveCopy(onState: (s: CopyState) => void, shouldStop: () => boolean = () => false): Promise<CopyState> {
  if (running) throw new Error("already running");
  const own = onState;
  onState = (s) => {
    own(s);
    copyNews.set(s); // the strip on My drive
  };
  running = true;
  try {
    const cfg = await loadConfig();
    if (!cfg.token) throw new Error("unlinked");
    const raw = cfg.key ?? (await fetch(`${cfg.server}/api/me`, { headers: auth(cfg) }).then((r) => r.json())).key;
    if (!raw) throw new Error("locked");
    const key = await importKey(raw);
    onState({ phase: "scanning", total: 0, copied: 0, failed: 0 });
    const list = await fetch(`${cfg.server}/api/google/files`, { headers: auth(cfg) }).then((r) => r.json());
    if (!list.connected || list.error) throw new Error(list.error ?? "Google Drive isn't connected.");
    const files: Listed[] = list.files;
    const done = await doneSet();
    const st: CopyState = { phase: "copying", total: files.length, copied: files.filter((f) => done.has(f.id)).length, failed: 0, bytes: list.bytes };
    onState({ ...st });
    const queue = files.filter((f) => !done.has(f.id)).sort((a, b) => (a.size || Number.MAX_SAFE_INTEGER) - (b.size || Number.MAX_SAFE_INTEGER));
    for (const f of queue) {
      if (shouldStop()) {
        st.phase = "paused";
        onState({ ...st });
        return st;
      }
      st.current = f.name;
      onState({ ...st });
      const tmp = `${FileSystem.cacheDirectory}gd-${f.id.replace(/[^A-Za-z0-9]/g, "")}.bin`;
      try {
        const q = new URLSearchParams({ id: f.id });
        if (f.exportAs) q.set("export", f.exportAs);
        const d = await FileSystem.downloadAsync(`${cfg.server}/api/google/file?${q}`, tmp, { headers: auth(cfg) });
        if (d.status !== 200) throw new Error(`fetch ${d.status}`);
        const bytes = fromB64(await FileSystem.readAsStringAsync(tmp, { encoding: FileSystem.EncodingType.Base64 }));
        await uploadBytes(cfg, key, bytes, { name: f.name, mime: f.mimeType, folder: f.folder ? `Google Drive/${f.folder}` : "Google Drive" }, undefined, "google-drive");
        done.add(f.id);
        await saveDone(done);
        st.copied++;
      } catch (e) {
        console.log("drive copy: failed", f.name, String((e as Error).message));
        st.failed++;
      } finally {
        FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
      }
      onState({ ...st });
    }
    st.phase = "done";
    delete st.current;
    const fresh = await loadConfig();
    await saveConfig({ ...fresh, setup: { ...(fresh.setup ?? {}), moved: true } });
    onState({ ...st });
    return st;
  } finally {
    running = false;
  }
}

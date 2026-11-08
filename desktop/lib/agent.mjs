import fs from "node:fs";
import path from "node:path";
import { Api, sleep } from "./api.mjs";
import { importKey, makeThumb, unwrapKey } from "./crypto.mjs";
import { changed, mimeOf } from "./scan.mjs";
import { loadState, saveConfig, saveState } from "./config.mjs";

// The loop: scan the watched folders, send what is new or changed (two at a
// time), remember what was sent, tell the server how things stand, watch for
// changes, rescan now and then. A changed file replaces its earlier copy.

const PARALLEL = 2;
const RESCAN_MS = 10 * 60 * 1000;
const REPORT_MS = 60 * 1000;
const VERSION = "0.1.0";

export async function runAgent({ cfg, dir, once = false, log = console.log, askPasscode }) {
  const api = new Api(cfg.server, cfg.token);
  const me = await api.me();
  let raw = me.key;
  if (!raw && me.keyWrapped) {
    // Locked account: the passcode opens the key here, once; it is kept with the link.
    raw = cfg.key ?? null;
    if (!raw) {
      if (!askPasscode) throw new Error("This account is locked with a passcode. Run without --yes once to enter it.");
      for (let tries = 0; !raw && tries < 3; tries++) {
        const pc = await askPasscode(me.keyWrapped.hint);
        raw = await unwrapKey(me.keyWrapped, pc);
        if (!raw) log("That passcode didn't open the files.");
      }
      if (!raw) throw new Error("Couldn't open the files with that passcode.");
      cfg.key = raw;
      saveConfig(dir, cfg);
    }
  } else if (raw && cfg.key) {
    delete cfg.key; // back to standard keeping: nothing to remember here
    saveConfig(dir, cfg);
  }
  if (!raw) throw new Error("The account has no key yet. Sign in to Stash in a browser once, then try again.");
  const key = await importKey(raw);
  const state = loadState(dir);
  const stats = new Map(cfg.folders.map((f) => [f.path, { ...f, files: 0, bytes: 0, pending: 0, failed: 0, lastUpload: lastUploadFor(state, f.path) }]));
  let status = "idle";
  let detail;
  let stopping = false;

  const report = async () => {
    try {
      await api.report({ status, detail, version: VERSION, folders: [...stats.values()].map((s) => ({ path: s.path, label: s.label, files: s.files, bytes: s.bytes, pending: s.pending, failed: s.failed, lastUpload: s.lastUpload })) });
    } catch (e) {
      if (String(e.message).includes("unlinked")) {
        log("This computer was unlinked from the account. Run again to link it afresh.");
        process.exit(2);
      }
    }
  };

  const pass = async (reason) => {
    status = "scanning";
    await report();
    const queue = [];
    for (const f of cfg.folders) {
      const s = stats.get(f.path);
      const r = changed(f.path, state);
      s.files = r.total;
      s.bytes = r.bytes;
      s.pending = r.pending.length;
      s.failed = 0;
      for (const item of r.pending) queue.push({ ...item, folder: f });
    }
    if (queue.length) log(`${reason}: ${queue.length} file${queue.length === 1 ? "" : "s"} to back up.`);
    else log(`${reason}: everything is backed up.`);
    status = queue.length ? "uploading" : "idle";
    detail = undefined;
    await report();
    // Smallest first: the drive fills visibly, and one big video doesn't block the rest.
    queue.sort((a, b) => a.size - b.size);
    let lastReport = Date.now();
    const worker = async () => {
      while (queue.length && !stopping) {
        const item = queue.shift();
        const s = stats.get(item.folder.path);
        const rel = path.relative(item.folder.path, item.path);
        const name = path.basename(item.path);
        const sub = path.dirname(rel).split(path.sep).filter((x) => x && x !== ".").join("/");
        const stashFolder = [cfg.deviceName, item.folder.label, sub].filter(Boolean).join("/");
        detail = name;
        try {
          const mime = mimeOf(name);
          const thumb = await makeThumb(item.path, mime);
          const file = await api.uploadFile(key, item.path, { name, mime, folder: stashFolder, source: "desktop" }, thumb);
          if (item.previousId) api.deleteFile(item.previousId).catch(() => {});
          state[item.path] = { size: item.size, mtimeMs: item.mtimeMs, fileId: file.id, at: Date.now() };
          saveState(dir, state);
          s.pending = Math.max(0, s.pending - 1);
          s.lastUpload = Date.now();
          log(`Backed up ${rel}`);
        } catch (e) {
          s.pending = Math.max(0, s.pending - 1);
          s.failed++;
          log(`Couldn't back up ${rel}: ${e.message}`);
        }
        if (Date.now() - lastReport > 15000) {
          lastReport = Date.now();
          await report();
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    saveState(dir, state, true);
    status = "idle";
    detail = undefined;
    await report();
  };

  await pass("First look");
  if (once) return;

  // Watch for changes; a short quiet period after the last event, then a pass.
  let timer = null;
  const bump = () => {
    clearTimeout(timer);
    timer = setTimeout(() => pass("Something changed").catch((e) => log(`Pass failed: ${e.message}`)), 5000);
  };
  for (const f of cfg.folders) {
    try {
      fs.watch(f.path, { recursive: true }, bump);
    } catch (e) {
      log(`Can't watch ${f.path} for changes (${e.message}); it is checked every ${RESCAN_MS / 60000} minutes instead.`);
    }
  }
  const rescan = setInterval(() => pass("Routine check").catch((e) => log(`Pass failed: ${e.message}`)), RESCAN_MS);
  const heartbeat = setInterval(report, REPORT_MS);
  log("Watching for changes. Leave this running; close it with Ctrl+C.");
  await new Promise((resolve) => {
    const stop = () => {
      stopping = true;
      clearInterval(rescan);
      clearInterval(heartbeat);
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
  status = "paused";
  await report();
  await sleep(100);
}

function lastUploadFor(state, root) {
  let t = 0;
  for (const [p, v] of Object.entries(state)) if (p.startsWith(root) && v.at > t) t = v.at;
  return t || undefined;
}

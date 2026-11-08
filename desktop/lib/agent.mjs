import fs from "node:fs";
import path from "node:path";
import { Api, sleep } from "./api.mjs";
import { importKey, makeThumb, unwrapKey } from "./crypto.mjs";
import { changed, mimeOf } from "./scan.mjs";
import { loadState, saveConfig, saveState } from "./config.mjs";

// The loop: scan the watched folders, send what is new or changed (two at a
// time), remember what was sent, tell the server how things stand, watch for
// changes, rescan now and then. A changed file replaces its earlier copy.
//
// createAgent() is what the app and the CLI both use: start(), stop(), pass(),
// and a state object the UI can show.

const PARALLEL = 2;
const RESCAN_MS = 10 * 60 * 1000;
const REPORT_MS = 60 * 1000;
export const VERSION = "0.2.0";

export function createAgent({ cfg, dir, log = () => {}, onState = () => {}, askPasscode = null }) {
  const api = new Api(cfg.server, cfg.token);
  const state = loadState(dir);
  const stats = new Map();
  const s = { status: "starting", detail: undefined, folders: [], lastError: null, paused: false };
  let stopping = false;
  let watchers = [];
  let rescan = null;
  let heartbeat = null;
  let passing = null;
  let key = null;

  const publish = () => {
    s.folders = [...stats.values()].map((f) => ({ ...f }));
    onState({ ...s });
  };

  const report = async () => {
    try {
      await api.report({ status: s.status, detail: s.detail, version: VERSION, folders: s.folders.map((f) => ({ path: f.path, label: f.label, files: f.files, bytes: f.bytes, pending: f.pending, failed: f.failed, lastUpload: f.lastUpload })) });
    } catch (e) {
      if (String(e.message).includes("unlinked")) {
        s.status = "error";
        s.lastError = "unlinked";
        publish();
        throw e;
      }
    }
  };

  const freshStats = (f) => ({ ...f, files: 0, bytes: 0, pending: 0, failed: 0, lastUpload: lastUploadFor(state, f.path) });

  async function prepare() {
    const me = await api.me();
    let raw = me.key;
    if (!raw && me.keyWrapped) {
      // Locked account: the passcode opens it here, once; it is kept with the link.
      raw = cfg.key ?? null;
      if (!raw) {
        if (!askPasscode) throw new Error("locked");
        for (let tries = 0; !raw && tries < 3; tries++) {
          const pc = await askPasscode(me.keyWrapped.hint);
          if (pc == null) throw new Error("locked");
          raw = await unwrapKey(me.keyWrapped, pc);
          if (!raw) log("That passcode didn't open the files.");
        }
        if (!raw) throw new Error("locked");
        cfg.key = raw;
        saveConfig(dir, cfg);
      }
    } else if (raw && cfg.key) {
      delete cfg.key; // back to standard keeping: nothing to remember here
      saveConfig(dir, cfg);
    }
    if (!raw) throw new Error("This account isn't ready yet. Sign in to Stash in a browser once, then try again.");
    key = await importKey(raw);
    stats.clear();
    for (const f of cfg.folders) stats.set(f.path, freshStats(f));
  }

  async function pass(reason = "Routine check") {
    if (passing) return passing;
    passing = (async () => {
      s.status = "scanning";
      s.detail = undefined;
      publish();
      await report();
      const queue = [];
      for (const f of cfg.folders) {
        if (!stats.has(f.path)) stats.set(f.path, freshStats(f));
        const st = stats.get(f.path);
        const r = changed(f.path, state);
        st.files = r.total;
        st.bytes = r.bytes;
        st.pending = r.pending.length;
        st.failed = 0;
        for (const item of r.pending) queue.push({ ...item, folder: f });
      }
      for (const p of [...stats.keys()]) if (!cfg.folders.some((f) => f.path === p)) stats.delete(p);
      log(queue.length ? `${reason}: ${queue.length} file${queue.length === 1 ? "" : "s"} to back up.` : `${reason}: everything is backed up.`);
      s.status = queue.length ? "uploading" : "idle";
      publish();
      await report();
      queue.sort((a, b) => a.size - b.size);
      let lastReport = Date.now();
      const worker = async () => {
        while (queue.length && !stopping && !s.paused) {
          const item = queue.shift();
          const st = stats.get(item.folder.path);
          const rel = path.relative(item.folder.path, item.path);
          const name = path.basename(item.path);
          const sub = path.dirname(rel).split(path.sep).filter((x) => x && x !== ".").join("/");
          const stashFolder = [cfg.deviceName, item.folder.label, sub].filter(Boolean).join("/");
          s.detail = name;
          publish();
          try {
            const mime = mimeOf(name);
            const thumb = await makeThumb(item.path, mime);
            const file = await api.uploadFile(key, item.path, { name, mime, folder: stashFolder, source: "desktop" }, thumb);
            if (item.previousId) api.deleteFile(item.previousId).catch(() => {});
            state[item.path] = { size: item.size, mtimeMs: item.mtimeMs, fileId: file.id, at: Date.now() };
            saveState(dir, state);
            if (st) {
              st.pending = Math.max(0, st.pending - 1);
              st.lastUpload = Date.now();
            }
            log(`Backed up ${rel}`);
          } catch (e) {
            if (st) {
              st.pending = Math.max(0, st.pending - 1);
              st.failed++;
            }
            s.lastError = e.message;
            log(`Couldn't back up ${rel}: ${e.message}`);
          }
          publish();
          if (Date.now() - lastReport > 15000) {
            lastReport = Date.now();
            await report();
          }
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
      saveState(dir, state, true);
      s.status = s.paused ? "paused" : "idle";
      s.detail = undefined;
      publish();
      await report();
    })().finally(() => {
      passing = null;
    });
    return passing;
  }

  let timer = null;
  const bump = () => {
    clearTimeout(timer);
    timer = setTimeout(() => pass("Something changed").catch((e) => log(`Pass failed: ${e.message}`)), 5000);
  };

  function watch() {
    for (const w of watchers) w.close();
    watchers = [];
    for (const f of cfg.folders) {
      try {
        watchers.push(fs.watch(f.path, { recursive: true }, bump));
      } catch (e) {
        log(`Can't watch ${f.path} for changes (${e.message}); it is checked every ${RESCAN_MS / 60000} minutes instead.`);
      }
    }
  }

  return {
    state: s,
    async start() {
      stopping = false;
      await prepare();
      await pass("First look");
      watch();
      rescan = setInterval(() => pass("Routine check").catch((e) => log(`Pass failed: ${e.message}`)), RESCAN_MS);
      heartbeat = setInterval(() => report().catch(() => {}), REPORT_MS);
      log("Watching for changes.");
    },
    // Folders changed in the UI: re-read the list and look again.
    async refolder() {
      watch();
      await pass("Folders changed");
    },
    pause() {
      s.paused = true;
      s.status = "paused";
      publish();
      report().catch(() => {});
    },
    resume() {
      s.paused = false;
      s.status = "idle";
      publish();
      pass("Resumed").catch(() => {});
    },
    pass,
    async stop() {
      stopping = true;
      clearTimeout(timer);
      clearInterval(rescan);
      clearInterval(heartbeat);
      for (const w of watchers) w.close();
      watchers = [];
      s.status = "paused";
      await report().catch(() => {});
      await sleep(50);
    },
  };
}

// The CLI's one-shot or watch mode, on top of createAgent.
export async function runAgent({ cfg, dir, once = false, log = console.log, askPasscode }) {
  const agent = createAgent({ cfg, dir, log, askPasscode });
  await agent.start();
  if (once) return agent.stop();
  log("Leave this running; close it with Ctrl+C.");
  await new Promise((resolve) => {
    const stop = () => agent.stop().then(resolve);
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

function lastUploadFor(state, root) {
  let t = 0;
  for (const [p, v] of Object.entries(state)) if (p.startsWith(root) && v.at > t) t = v.at;
  return t || undefined;
}

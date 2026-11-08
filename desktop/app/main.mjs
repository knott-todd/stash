// Stash Desktop, the app: a small window to link this computer and choose
// folders, then a tray icon while it backs up. Same engine as the CLI.
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDir, DEFAULT_SERVER, deviceName, loadConfig, platformName, saveConfig, suggestedFolders } from "../lib/config.mjs";
import { createAgent, VERSION } from "../lib/agent.mjs";
import { sleep } from "../lib/api.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(1);
const argValue = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dir = configDir(argValue("--config") ?? process.env.STASH_CONFIG_DIR);
const cfg = loadConfig(dir);
if (argValue("--server") ?? process.env.STASH_SERVER) cfg.server = argValue("--server") ?? process.env.STASH_SERVER;
if (argValue("--bypass") ?? process.env.STASH_BYPASS) cfg.bypass = argValue("--bypass") ?? process.env.STASH_BYPASS;
cfg.server ??= DEFAULT_SERVER;
// Staging sits behind Vercel's login; a bypass secret in the config or STASH_BYPASS lets the app through.
const bypassHeaders = () => (cfg.bypass ?? process.env.STASH_BYPASS ? { "x-vercel-protection-bypass": cfg.bypass ?? process.env.STASH_BYPASS } : {});
cfg.folders ??= [];

let win = null;
let tray = null;
let agent = null;
let agentState = { status: "off", folders: [] };
let linking = null;
let passcodeAsk = null;

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
app.on("second-instance", () => show());

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function snapshot() {
  return {
    version: VERSION,
    server: cfg.server,
    linked: !!cfg.token,
    email: cfg.email ?? null,
    deviceName: cfg.deviceName ?? deviceName(),
    folders: cfg.folders,
    suggested: suggestedFolders(),
    agent: agentState,
    linking,
    openAtLogin: app.getLoginItemSettings().openAtLogin,
    platform: process.platform,
  };
}

function show() {
  if (!win) createWindow();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 440,
    height: 640,
    resizable: false,
    title: "Stash",
    autoHideMenuBar: true,
    backgroundColor: "#fafafa",
    icon: path.join(here, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png"),
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(here, "ui", "index.html"));
  // Closing the window keeps the backup running in the tray.
  win.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on("closed", () => (win = null));
}

function trayMenu() {
  const status = agentState.status === "uploading" ? `Backing up${agentState.detail ? `: ${agentState.detail}` : ""}` : agentState.status === "scanning" ? "Looking for new files" : agentState.status === "paused" ? "Paused" : agentState.status === "error" ? "Needs attention" : cfg.token ? "Up to date" : "Not linked";
  return Menu.buildFromTemplate([
    { label: status, enabled: false },
    { type: "separator" },
    { label: "Open Stash Desktop", click: show },
    { label: "Open my drive in the browser", click: () => shell.openExternal(`${cfg.server}/devices`) },
    { type: "separator" },
    agentState.paused ? { label: "Resume", click: () => agent?.resume() } : { label: "Pause", click: () => agent?.pause(), enabled: !!agent },
    { label: "Check now", click: () => agent?.pass("Checked by you").catch(() => {}), enabled: !!agent },
    { type: "separator" },
    { label: "Quit Stash Desktop", click: () => { app.isQuitting = true; app.quit(); } },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(here, "..", "build", "tray.png"));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Stash Desktop");
  tray.setContextMenu(trayMenu());
  tray.on("click", show);
}

async function startAgent() {
  if (agent || !cfg.token || !cfg.folders.length) return;
  agent = createAgent({
    cfg,
    dir,
    log: (m) => send("log", m),
    onState: (st) => {
      agentState = st;
      send("state", snapshot());
      tray?.setContextMenu(trayMenu());
    },
    askPasscode: (hint) =>
      new Promise((resolve) => {
        passcodeAsk = resolve;
        send("askPasscode", { hint });
        show();
      }),
  });
  try {
    await agent.start();
  } catch (e) {
    agentState = { status: "error", folders: [], lastError: e.message };
    if (String(e.message).includes("unlinked")) {
      delete cfg.token;
      delete cfg.deviceId;
      saveConfig(dir, cfg);
    }
    agent = null;
    send("state", snapshot());
    tray?.setContextMenu(trayMenu());
  }
}

// ---- IPC: what the window can ask for.
ipcMain.handle("state", () => snapshot());

ipcMain.handle("link", async () => {
  if (linking) return linking;
  const name = deviceName();
  const r = await fetch(`${cfg.server}/api/devices/link`, { method: "POST", headers: { "content-type": "application/json", ...bypassHeaders() }, body: JSON.stringify({ name, platform: platformName(), kind: "desktop" }) });
  if (!r.ok) throw new Error(`Couldn't reach Stash (${r.status}). Check your connection.`);
  const l = await r.json();
  linking = { code: l.code, url: l.url };
  send("state", snapshot());
  shell.openExternal(l.url);
  (async () => {
    const deadline = Date.now() + l.expiresInSeconds * 1000;
    while (Date.now() < deadline && linking) {
      await sleep(2500);
      const st = await fetch(`${cfg.server}/api/devices/link?id=${encodeURIComponent(l.linkId)}&secret=${encodeURIComponent(l.secret)}`, { headers: bypassHeaders() }).then((x) => x.json()).catch(() => ({ state: "waiting" }));
      if (st.state === "approved") {
        cfg.token = st.token;
        cfg.deviceId = st.deviceId;
        cfg.deviceName = name;
        cfg.email = st.email;
        saveConfig(dir, cfg);
        linking = null;
        send("state", snapshot());
        show();
        return;
      }
      if (st.state !== "waiting") break;
    }
    linking = null;
    send("state", { ...snapshot(), linkExpired: true });
  })();
  return linking;
});

ipcMain.handle("cancelLink", () => {
  linking = null;
  return snapshot();
});

ipcMain.handle("openLink", () => linking && shell.openExternal(linking.url));

ipcMain.handle("setFolders", async (_e, folders) => {
  cfg.folders = folders.filter((f) => f && f.path).map((f) => ({ label: String(f.label || path.basename(f.path)), path: String(f.path) }));
  saveConfig(dir, cfg);
  if (agent) await agent.refolder();
  else await startAgent();
  return snapshot();
});

ipcMain.handle("pickFolder", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"], title: "Choose a folder to keep backed up" });
  if (r.canceled || !r.filePaths[0]) return null;
  return { label: path.basename(r.filePaths[0]), path: r.filePaths[0] };
});

ipcMain.handle("pause", () => (agent?.pause(), snapshot()));
ipcMain.handle("resume", () => (agent?.resume(), snapshot()));
ipcMain.handle("checkNow", () => (agent?.pass("Checked by you").catch(() => {}), snapshot()));
ipcMain.handle("openWeb", (_e, p = "/devices") => shell.openExternal(cfg.server + p));
ipcMain.handle("setOpenAtLogin", (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on, args: ["--hidden"] });
  return snapshot();
});
ipcMain.handle("passcode", (_e, value) => {
  passcodeAsk?.(value);
  passcodeAsk = null;
  return true;
});
ipcMain.handle("unlink", async () => {
  await agent?.stop();
  agent = null;
  delete cfg.token;
  delete cfg.deviceId;
  delete cfg.key;
  cfg.email = null;
  saveConfig(dir, cfg);
  agentState = { status: "off", folders: [] };
  return snapshot();
});

app.whenReady().then(async () => {
  createTray();
  if (!argv.includes("--hidden") || !cfg.token) show();
  // First run: start with the computer, so it keeps working after a restart.
  if (!app.getLoginItemSettings().openAtLogin && process.env.NODE_ENV !== "test") app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });
  await startAgent();
});

app.on("window-all-closed", () => {}); // stay in the tray
app.on("before-quit", () => {
  app.isQuitting = true;
  agent?.stop().catch(() => {});
});

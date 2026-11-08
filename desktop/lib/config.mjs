import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Where this computer keeps its link to the account and what it watches.
//   ~/.stash/config.json   server, token, device id and name, folders
//   ~/.stash/state.json    what has been sent (path → size, mtime, file id)

export const DEFAULT_SERVER = "https://stash.olusanyatodd.com";

export function configDir(override) {
  return override ?? path.join(os.homedir(), ".stash");
}

export function loadConfig(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
  } catch {
    return { server: DEFAULT_SERVER, folders: [] };
  }
}

export function saveConfig(dir, cfg) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(cfg, null, 2));
}

export function loadState(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"));
  } catch {
    return {};
  }
}

let saveTimer = null;
export function saveState(dir, state, now = false) {
  const write = () => {
    saveTimer = null;
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, "state.json.tmp");
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, path.join(dir, "state.json"));
  };
  if (now) return write();
  if (!saveTimer) saveTimer = setTimeout(write, 2000);
}

// Folders people usually mean by "my files". Only the ones that exist.
export function suggestedFolders() {
  const home = os.homedir();
  const candidates = [
    { label: "Documents", path: path.join(home, "Documents") },
    { label: "Pictures", path: path.join(home, "Pictures") },
    { label: "Desktop", path: path.join(home, "Desktop") },
    { label: "Videos", path: path.join(home, process.platform === "darwin" ? "Movies" : "Videos") },
  ];
  // OneDrive moves Documents and Pictures under its own folder on many Windows machines.
  const od = process.env.OneDrive;
  if (od) {
    for (const name of ["Documents", "Pictures", "Desktop"]) {
      const p = path.join(od, name);
      if (fs.existsSync(p) && !candidates.some((c) => c.path === p)) candidates.push({ label: `${name} (OneDrive)`, path: p });
    }
  }
  return candidates.filter((c) => fs.existsSync(c.path));
}

export function platformName() {
  return { win32: "windows", darwin: "macos", linux: "linux" }[process.platform] ?? process.platform;
}

export function deviceName() {
  const host = os.hostname().replace(/\.local$/i, "");
  const user = os.userInfo().username;
  return `${user}'s ${process.platform === "darwin" ? "Mac" : "computer"} (${host})`;
}

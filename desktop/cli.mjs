#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { spawn } from "node:child_process";
import { configDir, deviceName, DEFAULT_SERVER, loadConfig, platformName, saveConfig, suggestedFolders } from "./lib/config.mjs";
import { runAgent } from "./lib/agent.mjs";
import { sleep } from "./lib/api.mjs";

// Stash Desktop: keeps folders on this computer backed up to your Stash account.
//
//   stash-desktop                 link (first time), choose folders, then watch
//   stash-desktop --add <folder>  watch another folder
//   stash-desktop --remove <folder>
//   stash-desktop --folders       list watched folders
//   stash-desktop --once          one pass, then exit
//   stash-desktop --unlink        forget this computer's link
//   stash-desktop --install-startup   start with Windows / macOS login
//   --server <url>  --config <dir>  --yes (take the suggested folders, no questions)

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const dir = configDir(value("--config"));
const cfg = loadConfig(dir);
if (value("--server")) cfg.server = value("--server");
if (value("--bypass")) cfg.bypass = value("--bypass");
cfg.server ??= DEFAULT_SERVER;
// Staging sits behind Vercel's login; a bypass secret in the config or STASH_BYPASS lets the app through.
const bypassHeaders = () => (cfg.bypass ?? process.env.STASH_BYPASS ? { "x-vercel-protection-bypass": cfg.bypass ?? process.env.STASH_BYPASS } : {});
cfg.folders ??= [];

const log = (s) => console.log(s);

async function ask(q, def) {
  if (flag("--yes")) return def;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const a = (await rl.question(q)).trim();
    return a === "" ? def : a;
  } finally {
    rl.close();
  }
}

function openBrowser(url) {
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore" }).unref();
  } catch {}
}

async function link() {
  const name = deviceName();
  const r = await fetch(`${cfg.server}/api/devices/link`, { method: "POST", headers: { "content-type": "application/json", ...bypassHeaders() }, body: JSON.stringify({ name, platform: platformName(), kind: "desktop" }) });
  if (!r.ok) throw new Error(`Couldn't reach ${cfg.server} (${r.status}).`);
  const l = await r.json();
  log("");
  log(`  Your code:  ${l.code}`);
  log("");
  log(`  Open ${l.url}`);
  log("  sign in if asked, and approve this computer. Waiting...");
  if (!flag("--no-browser")) openBrowser(l.url);
  const deadline = Date.now() + l.expiresInSeconds * 1000;
  while (Date.now() < deadline) {
    await sleep(2500);
    const s = await fetch(`${cfg.server}/api/devices/link?id=${encodeURIComponent(l.linkId)}&secret=${encodeURIComponent(l.secret)}`, { headers: bypassHeaders() }).then((x) => x.json()).catch(() => ({ state: "waiting" }));
    if (s.state === "approved") {
      cfg.token = s.token;
      cfg.deviceId = s.deviceId;
      cfg.deviceName = name;
      cfg.email = s.email;
      saveConfig(dir, cfg);
      log(`  Linked to ${s.email ?? "your account"}.`);
      return;
    }
    if (s.state === "expired" || s.state === "gone") throw new Error("The code expired. Run again for a new one.");
  }
  throw new Error("The code expired. Run again for a new one.");
}

async function chooseFolders() {
  const sug = suggestedFolders();
  log("");
  log("Which folders should stay backed up? Suggested:");
  sug.forEach((s, i) => log(`  ${i + 1}. ${s.label}   ${s.path}`));
  const a = await ask("Numbers to keep (e.g. 1 2), or a full path, or Enter for Documents and Pictures: ", "");
  const chosen = [];
  if (a === "") {
    for (const s of sug) if (/^(Documents|Pictures)/.test(s.label)) chosen.push(s);
  } else if (/^[\d\s]+$/.test(a)) {
    for (const n of a.split(/\s+/)) if (sug[Number(n) - 1]) chosen.push(sug[Number(n) - 1]);
  } else if (fs.existsSync(a)) {
    chosen.push({ label: path.basename(a), path: path.resolve(a) });
  }
  if (!chosen.length) throw new Error("No folders chosen.");
  cfg.folders = chosen;
  saveConfig(dir, cfg);
  log(`Keeping backed up: ${chosen.map((c) => c.label).join(", ")}.`);
}

function installStartup() {
  const here = path.resolve(process.argv[1]);
  if (process.platform === "win32") {
    const startup = path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
    const cmd = path.join(startup, "Stash Desktop.cmd");
    fs.writeFileSync(cmd, `@echo off\r\nstart "Stash Desktop" /min "${process.execPath}" "${here}" --config "${dir}"\r\n`);
    log(`Stash Desktop will start with Windows (${cmd}).`);
  } else if (process.platform === "darwin") {
    const plist = path.join(process.env.HOME, "Library", "LaunchAgents", "com.stash.desktop.plist");
    fs.mkdirSync(path.dirname(plist), { recursive: true });
    fs.writeFileSync(
      plist,
      `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>Label</key><string>com.stash.desktop</string><key>ProgramArguments</key><array><string>${process.execPath}</string><string>${here}</string><string>--config</string><string>${dir}</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict></plist>\n`,
    );
    log(`Stash Desktop will start at login (${plist}). Run: launchctl load ${plist}`);
  } else {
    log("On Linux, add this to your session startup: node " + here);
  }
}

try {
  if (flag("--help") || flag("-h")) {
    log(fs.readFileSync(new URL(import.meta.url)).toString().split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
    process.exit(0);
  }
  if (flag("--unlink")) {
    delete cfg.token;
    delete cfg.deviceId;
    saveConfig(dir, cfg);
    log("Unlinked. Run again to link afresh.");
    process.exit(0);
  }
  if (flag("--folders")) {
    cfg.folders.forEach((f) => log(`${f.label}   ${f.path}`));
    process.exit(0);
  }
  if (value("--add")) {
    const p = path.resolve(value("--add"));
    if (!fs.existsSync(p)) throw new Error(`${p} doesn't exist.`);
    if (!cfg.folders.some((f) => f.path === p)) cfg.folders.push({ label: value("--label") ?? path.basename(p), path: p });
    saveConfig(dir, cfg);
    log(`Watching ${p}.`);
    if (!flag("--run")) process.exit(0);
  }
  if (value("--remove")) {
    const p = path.resolve(value("--remove"));
    cfg.folders = cfg.folders.filter((f) => f.path !== p);
    saveConfig(dir, cfg);
    log(`No longer watching ${p}.`);
    process.exit(0);
  }
  if (flag("--install-startup")) {
    installStartup();
    process.exit(0);
  }

  log("Stash Desktop");
  if (!cfg.token) await link();
  if (!cfg.folders.length) await chooseFolders();
  const askPasscode = flag("--yes") ? null : async (hint) => ask(hint ? `This account is locked. Passcode (hint: ${hint}): ` : "This account is locked. Passcode: ", "");
  await runAgent({ cfg, dir, once: flag("--once"), log, askPasscode });
} catch (e) {
  console.error(e.message ?? e);
  process.exit(1);
}

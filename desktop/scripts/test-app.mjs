// Drives the real app end to end with Playwright's Electron support:
// link (approving as the browser would), choose a scratch folder, watch it back
// up, confirm the files on the server, then add a file and see it follow.
// Usage: node scripts/test-app.mjs <server with STASH_DEV_SIGNIN> <scratch dir>
import fs from "node:fs";
import path from "node:path";
import { _electron as electron } from "playwright";

const [server, scratch] = process.argv.slice(2);
if (!server || !scratch) throw new Error("usage: test-app.mjs <server> <scratch dir>");
const J = { "content-type": "application/json" };
const cfgDir = path.join(scratch, "cfg");
const watch = path.join(scratch, "watch");
fs.rmSync(cfgDir, { recursive: true, force: true });
fs.rmSync(watch, { recursive: true, force: true });
fs.mkdirSync(path.join(watch, "Sub"), { recursive: true });
fs.writeFileSync(path.join(watch, "one.txt"), "one");
fs.writeFileSync(path.join(watch, "Sub", "two.txt"), "two");

// The browser side: a signed-in session that will approve the code.
let r = await fetch(server + "/api/auth/dev", { method: "POST", headers: J, body: JSON.stringify({ email: "app@test.local" }) });
const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
await fetch(server + "/api/account/protection", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ mode: "standard" }) });

const out = {};
const app = await electron.launch({ args: [".", "--config", cfgDir, "--server", server], env: { ...process.env, NODE_ENV: "test", STASH_TEST_FOLDER: watch } });
const page = await app.firstWindow();
await page.waitForSelector("[data-testid=link]");
out.screen1 = (await page.textContent("h1")).trim();

// Link: the app opens the browser (ignored here); we approve with the cookie.
await page.click("[data-testid=link]");
await page.waitForSelector("[data-testid=code]");
const code = (await page.textContent("[data-testid=code]")).trim();
out.code = code.length;
out.approve = (await fetch(server + "/api/devices/link/approve", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ code }) })).status;

// Folders screen: choose the scratch folder through the same call the Start button makes.
await page.waitForSelector("[data-testid=folders]", { timeout: 30000 });
out.screen2 = (await page.textContent("h1")).trim();
out.suggestedShown = (await page.$$("input[type=checkbox][data-path]")).length;
await page.evaluate((p) => window.stash.invoke("setFolders", [{ path: p, label: "Scratch" }]), watch);

// Status screen: wait until up to date.
await page.waitForSelector("[data-testid=status]", { timeout: 30000 });
for (let i = 0; i < 60; i++) {
  const t = await page.textContent("[data-testid=status]");
  if (/Up to date/.test(t)) break;
  await new Promise((res) => setTimeout(res, 1000));
}
out.status = (await page.textContent("[data-testid=status]")).trim();
const files = (await fetch(server + "/api/files", { headers: { cookie } }).then((x) => x.json())).files.filter((f) => f.source === "desktop");
out.filesAfterFirstPass = files.map((f) => f.folder.split("/").slice(1).concat(f.name).join("/")).sort();

// A new file appears on disk: the watcher should pick it up without any click.
fs.writeFileSync(path.join(watch, "three.txt"), "three");
let picked = false;
for (let i = 0; i < 40 && !picked; i++) {
  await new Promise((res) => setTimeout(res, 1000));
  const now = (await fetch(server + "/api/files", { headers: { cookie } }).then((x) => x.json())).files;
  picked = now.some((f) => f.name === "three.txt");
}
out.newFileFollowed = picked;
const devices = (await fetch(server + "/api/devices", { headers: { cookie } }).then((x) => x.json())).devices;
out.deviceOnServer = devices.map((d) => ({ name: d.name.slice(0, 12), files: d.files, status: d.state?.status, folders: d.state?.folders?.map((f) => f.label) }));
await app.close();
for (const f of (await fetch(server + "/api/files", { headers: { cookie } }).then((x) => x.json())).files) await fetch(`${server}/api/files/${f.id}`, { method: "DELETE", headers: { cookie } });
console.log(JSON.stringify(out, null, 1));

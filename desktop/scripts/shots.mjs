// Screenshots of the three screens, for review. Usage: node scripts/shots.mjs <server> <scratch> <outdir>
import fs from "node:fs";
import path from "node:path";
import { _electron as electron } from "playwright";
const [server, scratch, outDir] = process.argv.slice(2);
const J = { "content-type": "application/json" };
const cfgDir = path.join(scratch, "cfg-shots");
const watch = path.join(scratch, "watch-shots");
fs.rmSync(cfgDir, { recursive: true, force: true });
fs.rmSync(watch, { recursive: true, force: true });
fs.mkdirSync(path.join(watch, "Holiday 2026"), { recursive: true });
fs.writeFileSync(path.join(watch, "Tax return.pdf"), "x");
fs.writeFileSync(path.join(watch, "Holiday 2026", "IMG_0412.jpg"), "x");
fs.mkdirSync(outDir, { recursive: true });
let r = await fetch(server + "/api/auth/dev", { method: "POST", headers: J, body: JSON.stringify({ email: "shots@test.local" }) });
const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
await fetch(server + "/api/account/protection", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ mode: "standard" }) });
const app = await electron.launch({ args: [".", "--config", cfgDir, "--server", server], env: { ...process.env, NODE_ENV: "test" } });
const page = await app.firstWindow();
await page.waitForSelector("[data-testid=link]");
await page.screenshot({ path: path.join(outDir, "1-link.png") });
await page.click("[data-testid=link]");
await page.waitForSelector("[data-testid=code]");
await page.screenshot({ path: path.join(outDir, "2-code.png") });
const code = (await page.textContent("[data-testid=code]")).trim();
await fetch(server + "/api/devices/link/approve", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ code }) });
await page.waitForSelector("[data-testid=folders]", { timeout: 30000 });
await page.screenshot({ path: path.join(outDir, "3-folders.png") });
await page.evaluate((p) => window.stash.invoke("setFolders", [{ path: p, label: "Documents" }]), watch);
await page.waitForSelector("[data-testid=status]", { timeout: 30000 });
for (let i = 0; i < 30; i++) {
  if (/Up to date/.test(await page.textContent("[data-testid=status]"))) break;
  await new Promise((res) => setTimeout(res, 1000));
}
await page.screenshot({ path: path.join(outDir, "4-status.png") });
await app.close();
for (const f of (await fetch(server + "/api/files", { headers: { cookie } }).then((x) => x.json())).files) await fetch(`${server}/api/files/${f.id}`, { method: "DELETE", headers: { cookie } });
console.log("done");

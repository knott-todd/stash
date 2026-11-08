// Production smoke: real upload → register → download → compare → delete.
// Direct multipart by default (what the browser does for files ≤ 4 MB).
// Usage: node scripts/prod-smoke.mjs [https://stash.olusanyatodd.com] [--staged]
import { upload } from "@vercel/blob/client";
const args = process.argv.slice(2);
const B = args.find((a) => a.startsWith("http")) ?? "https://stash.olusanyatodd.com";
const staged = args.includes("--staged");
const text = "prod roundtrip " + new Date().toISOString();
const plain = new TextEncoder().encode(text);

let r;
if (staged) {
  const put = await upload("tmp/node-test.stash", new Blob([plain]), { access: "private", handleUploadUrl: B + "/api/blob", contentType: "application/octet-stream" });
  r = await fetch(B + "/api/files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blobUrl: put.url, name: "node-test.txt", mime: "text/plain", size: String(plain.length), folder: "", source: "upload", encrypted: "0" }) });
} else {
  const form = new FormData();
  form.set("file", new Blob([plain], { type: "text/plain" }), "node-test.txt");
  form.set("name", "node-test.txt"); form.set("mime", "text/plain"); form.set("size", String(plain.length));
  form.set("folder", ""); form.set("source", "upload"); form.set("encrypted", "0");
  r = await fetch(B + "/api/files", { method: "POST", body: form });
}
const cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
const j = await r.json();
if (!r.ok) throw new Error("files POST " + r.status + " " + JSON.stringify(j));
const back = await fetch(B + "/api/files/" + j.file.id + "/download", { headers: { cookie } }).then((x) => x.text());
const del = await fetch(B + "/api/files/" + j.file.id, { method: "DELETE", headers: { cookie } });
const gone = (await fetch(B + "/api/files", { headers: { cookie } }).then((x) => x.json())).files.length;
console.log(JSON.stringify({ mode: staged ? "staged" : "direct", stored: j.file.stored, name: j.file.name, size: j.file.size, roundtrip: back === text, deleted: del.ok, remaining: gone }));

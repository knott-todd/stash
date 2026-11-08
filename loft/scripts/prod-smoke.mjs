// Production smoke: sign in (dev route, local only) or reuse a session cookie,
// upload small and large files, read them back, delete.
// Usage: node scripts/prod-smoke.mjs [base] [--cookie "stash_sid=..."] [--large]
const args = process.argv.slice(2);
const B = args.find((a) => a.startsWith("http")) ?? "https://stash.olusanyatodd.com";
const ci = args.indexOf("--cookie");
let cookie = ci >= 0 ? args[ci + 1] : "";
if (!cookie) {
  const r = await fetch(B + "/api/auth/dev", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "smoke@test.local" }) });
  if (!r.ok) throw new Error("no cookie given and dev sign-in refused (" + r.status + ")");
  cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const H = { cookie };
const out = {};
const text = "prod roundtrip " + new Date().toISOString();
const form = new FormData();
form.set("file", new Blob([text], { type: "text/plain" }), "node-test.txt");
form.set("name", "node-test.txt"); form.set("mime", "text/plain"); form.set("size", String(text.length)); form.set("encrypted", "0");
let r = await fetch(B + "/api/files", { method: "POST", body: form, headers: H });
const j = await r.json();
if (!r.ok) throw new Error("files POST " + r.status + " " + JSON.stringify(j));
const back = await fetch(B + "/api/files/" + j.file.id + "/download", { headers: H }).then((x) => x.text());
out.small = { stored: j.file.stored, roundtrip: back === text };
await fetch(B + "/api/files/" + j.file.id, { method: "DELETE", headers: H });

if (args.includes("--large")) {
  // 9 MB in three pieces (4,000,028 / 4,000,028 / rest), unencrypted bytes for the check.
  const PIECE = 4_000_028;
  const big = new Uint8Array(9_000_000);
  for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 255;
  const parts = [];
  for (let i = 0, off = 0; off < big.length; i++, off += PIECE) {
    const fd = new FormData();
    fd.set("piece", new Blob([big.subarray(off, Math.min(off + PIECE, big.length))]), "big.part" + i);
    fd.set("name", "big.bin"); fd.set("index", String(i));
    const pr = await fetch(B + "/api/files/part", { method: "POST", body: fd, headers: H });
    const pj = await pr.json();
    if (!pr.ok) throw new Error("part " + i + " " + pr.status + " " + JSON.stringify(pj));
    parts.push(pj.part);
  }
  r = await fetch(B + "/api/files", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ name: "big.bin", mime: "application/octet-stream", size: String(big.length), encrypted: "0", parts }) });
  const bj = await r.json();
  if (!r.ok) throw new Error("register " + r.status + " " + JSON.stringify(bj));
  const got = new Uint8Array(await fetch(B + "/api/files/" + bj.file.id + "/download", { headers: H }).then((x) => x.arrayBuffer()));
  let same = got.length === big.length;
  for (let i = 0; same && i < got.length; i += 997) if (got[i] !== big[i]) same = false;
  out.large = { pieces: parts.length, chunked: bj.file.chunked, bytesBack: got.length, roundtrip: same };
  await fetch(B + "/api/files/" + bj.file.id, { method: "DELETE", headers: H });
}
out.remaining = (await fetch(B + "/api/files", { headers: H }).then((x) => x.json())).files.length;
console.log(JSON.stringify(out));

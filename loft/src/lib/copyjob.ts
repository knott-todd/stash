import { webcrypto } from "node:crypto";
import { newId, store, type QueueItem, type QueueRow, type StashFile, type StoredPart } from "./store";
import { CHUNK_PLAIN_BYTES, MAX_BYTES } from "./files-limits";
import { putObject, StorageBusy } from "./telegram";
import { bumpRev } from "./rev";
import { BUDGET_BYTES_PER_HOUR } from "./ratelimit";
import * as google from "./google";
import * as others from "./providers";

// Moving another drive into Stash, on the server, with no browser open.
//
// The listing becomes one small queue row per file. A run claims a lease, copies files
// (download → encrypt with the account key → store) for about four minutes, then hands
// over to the next run. Nothing ends it except the person pressing Stop, or the other
// drive taking access back (then it waits for a reconnect). Network trouble and busy
// storage are waited out; a file that fails for reasons of its own is set aside after a
// few tries so it never blocks the rest.
//
// Only Standard accounts: Stash holds their key. Passcode accounts copy in the browser
// (provider-client.ts) and report their progress into the same record.

export type { CopyProvider, CopyRecord, CopyState } from "./copy-types";
import { isCopyProvider, type CopyProvider, type CopyRecord, type CopyState } from "./copy-types";

const recKey = (uid: string, p: CopyProvider) => `copy:${uid}:${p}`;
const leaseKey = (uid: string, p: CopyProvider) => `copylease:${uid}:${p}`;
const foldersKey = (uid: string, p: CopyProvider) => `copyfolders:${uid}:${p}`;

const RUN_MS = Number(process.env.STASH_COPY_RUN_MS) || 230_000; // a run's working time; functions may live 300 s
const STALE_MS = 6 * 60_000; // no heartbeat for this long: the chain broke, restart it
const BATCH = 6;
const PARALLEL = 3;
const FINAL_AT = 30; // a file is set aside once its tries reach this (a final refusal counts 10)
const IDLE_MS = 90_000; // a download that sends nothing for this long is dead

export async function getRecord(uid: string, p: CopyProvider) {
  return store().kvGet<CopyRecord>(recKey(uid, p));
}
export async function allRecords(uid: string): Promise<CopyRecord[]> {
  const rows = await store().kvList(`copy:${uid}:`);
  return rows.map((r) => r.value as CopyRecord).filter((r) => isCopyProvider(r?.provider));
}
// Every copy record, for the watchdog. Keys are copy:<uid>:<provider>; uids contain colons ("g:123").
export async function allRecordsEverywhere(): Promise<{ uid: string; rec: CopyRecord }[]> {
  const rows = await store().kvList("copy:");
  return rows
    .map((r) => ({ uid: r.key.slice(5, r.key.lastIndexOf(":")), rec: r.value as CopyRecord }))
    .filter((x) => x.uid && isCopyProvider(x.rec?.provider));
}

async function putRecord(uid: string, r: CopyRecord) {
  r.updatedAt = Date.now();
  await store().kvSet(recKey(uid, r.provider), r);
}
// Progress written by a run never overrides a Stop pressed meanwhile.
async function patchRecord(uid: string, p: CopyProvider, patch: Partial<CopyRecord>, onlyIf: CopyState[] = ["listing", "running"]) {
  const cur = await getRecord(uid, p);
  if (!cur || !onlyIf.includes(cur.state)) return cur ?? null;
  const next = { ...cur, ...patch };
  await putRecord(uid, next);
  return next;
}

// ---------- what the person does ----------

export async function startCopy(uid: string, p: CopyProvider, mode: "server" | "browser", opts: { relist?: boolean } = {}) {
  const prev = await getRecord(uid, p);
  const now = Date.now();
  const relist = opts.relist || !prev || prev.mode !== mode;
  // A listing cut short by a Stop carries on from its page; a relist starts over.
  const listing = mode === "server" && (relist || !prev?.listComplete);
  const r: CopyRecord = {
    provider: p,
    mode,
    state: listing ? "listing" : "running",
    ...(listing && !relist && prev ? { listCursor: prev.listCursor, listedFolders: prev.listedFolders } : {}),
    listComplete: listing ? false : true,
    total: prev?.total ?? 0,
    bytes: prev?.bytes ?? 0,
    copied: prev?.copied ?? 0,
    copiedBytes: prev?.copiedBytes ?? 0,
    failed: mode === "server" ? 0 : (prev?.failed ?? 0), // set-aside files go back in the queue below
    skipped: prev?.skipped ?? 0,
    startedAt: prev?.startedAt ?? now,
    updatedAt: now,
    heartbeat: now,
  };
  // Resuming gives the set-aside files another go.
  if (mode === "server") await store().queueRetryFailed(uid, p);
  await putRecord(uid, r);
  return r;
}

export async function stopCopy(uid: string, p: CopyProvider) {
  const r = await getRecord(uid, p);
  if (!r || r.state === "done") return r ?? null;
  r.state = "stopped";
  delete r.waitUntil;
  await putRecord(uid, r);
  return r;
}

// Switching accounts, or disconnecting: forget the queue and the record.
export async function forgetCopy(uid: string, p: CopyProvider) {
  const db = store();
  await db.queueClear(uid, p);
  await db.kvDelete(recKey(uid, p));
  await db.kvDelete(foldersKey(uid, p));
}

// The browser copy (passcode accounts) reports where it is.
export async function reportCopy(uid: string, p: CopyProvider, s: Partial<CopyRecord>) {
  const cur = await getRecord(uid, p);
  if (!cur || cur.mode !== "browser") return null;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  const state: CopyState = s.state === "done" || s.state === "stopped" || s.state === "running" ? s.state : cur.state;
  // A Stop is final until Resume; a late report from a still-closing tab doesn't undo it.
  if (cur.state === "stopped" && state === "running") return cur;
  const next: CopyRecord = {
    ...cur,
    state,
    total: num(s.total, cur.total),
    bytes: num(s.bytes, cur.bytes),
    copied: num(s.copied, cur.copied),
    copiedBytes: num(s.copiedBytes, cur.copiedBytes),
    failed: num(s.failed, cur.failed),
    skipped: num(s.skipped, cur.skipped),
    heartbeat: Date.now(),
    last: s.last && typeof s.last.name === "string" ? { name: s.last.name.slice(0, 255), folder: String(s.last.folder ?? "").slice(0, 1024) } : cur.last,
  };
  await putRecord(uid, next);
  return next;
}


// ---------- keeping it going ----------

const SECRET = () => process.env.CRON_SECRET;
export function runAuthorized(auth: string | null) {
  const s = SECRET();
  if (!process.env.VERCEL && !s) return true; // local development
  return !!s && auth === `Bearer ${s}`;
}

// Ask a fresh function to take the next run. The receiving route answers at once and
// works after responding, so this returns in moments.
// The answer is written on the record ("handover"), so a blocked call (a missing secret,
// a login wall that redirects) shows up instead of passing for success.
export async function kick(origin: string, uid: string, p: CopyProvider) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (SECRET()) headers.authorization = `Bearer ${SECRET()}`;
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const status = await fetch(`${origin}/api/copy/run`, { method: "POST", headers, body: JSON.stringify({ uid, provider: p }), redirect: "manual", signal: AbortSignal.timeout(15_000) })
    .then((r) => r.status)
    .catch(() => 0);
  const cur = await getRecord(uid, p).catch(() => undefined);
  if (cur) await store().kvSet(recKey(uid, p), { ...cur, handover: { at: Date.now(), ok: status === 202, status } }).catch(() => {});
  return status === 202;
}

// One run here and now, then hand over to the next. Used when a person starts or resumes a
// copy and when an open page finds it quiet, so a copy someone is watching never depends on
// the handover working.
export async function runAndHandOver(origin: string, uid: string, p: CopyProvider) {
  const r = await runStep(uid, p).catch((e) => ({ again: true, note: `run crashed: ${e}` }));
  if (r.again) await kick(origin, uid, p);
  return r;
}

// A copy that's meant to be moving but hasn't shown a sign of life for a while.
export const isQuiet = (r: CopyRecord, ms: number, now = Date.now()) => r.mode === "server" && (r.state === "running" || r.state === "listing") && now - (r.heartbeat ?? 0) > ms;

export const needsKick = (r: CopyRecord, now = Date.now()) => r.mode === "server" && (r.state === "running" || r.state === "listing") && now - (r.heartbeat ?? 0) > STALE_MS;

// ---------- one run ----------

class Fail extends Error {
  constructor(
    public kind: "transient" | "final" | "reconnect" | "busy",
    message: string,
    public waitSeconds = 0,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

async function tokenFor(uid: string, p: CopyProvider): Promise<string> {
  try {
    const t = p === "google-drive" ? await google.accessTokenFor(uid) : await others.accessTokenFor(p, uid);
    if (!t) throw new Fail("reconnect", "not connected");
    return t;
  } catch (e) {
    if (e instanceof Fail) throw e;
    if (/invalid_grant/i.test(String((e as Error).message))) throw new Fail("reconnect", "access taken back");
    throw new Fail("transient", "token refresh failed");
  }
}

// ---- sources: where the bytes come from ----

type Listed = { fid: string; item: QueueItem };
type Source = {
  // One step of the listing. Returns the files found and whether there is more.
  listStep(uid: string, r: CopyRecord, signal: AbortSignal): Promise<{ files: Listed[]; done: boolean }>;
  open(uid: string, fid: string, item: QueueItem, from: number, signal: AbortSignal): Promise<Response>;
};

const googleSource: Source = {
  async listStep(uid, r, signal) {
    const token = await tokenFor(uid, "google-drive");
    const db = store();
    try {
      if (!r.listedFolders) {
        await db.kvSet(foldersKey(uid, "google-drive"), await google.listFolders(token, signal));
        r.listedFolders = true;
        return { files: [], done: false };
      }
      const folders = (await db.kvGet<google.GFolders>(foldersKey(uid, "google-drive"))) ?? {};
      const page = await google.listFilesPage(token, folders, r.listCursor, signal);
      r.listCursor = page.next;
      return { files: page.files.map((f) => ({ fid: f.id, item: { name: f.name, mime: f.mimeType, size: f.size, folder: f.folder, ...(f.exportAs ? { exportAs: f.exportAs } : {}) } })), done: !page.next };
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) throw new Fail("reconnect", "listing refused");
      throw new Fail("transient", String((e as Error).message));
    }
  },
  async open(uid, fid, item, from, signal) {
    const token = await tokenFor(uid, "google-drive");
    const r = await google.fetchFile(token, fid, item.exportAs, { from, signal });
    if (r.ok) return r;
    const { retry, reason } = await google.googleRefusal(r);
    if (r.status === 401) throw new Fail("transient", "token refused");
    throw new Fail(retry ? "transient" : "final", `Google: ${reason}`);
  },
};

function otherSource(p: "dropbox" | "onedrive"): Source {
  return {
    async listStep(uid) {
      const token = await tokenFor(uid, p);
      try {
        const files = await others.listAll(p, token);
        return { files: files.map((f) => ({ fid: f.id, item: { name: f.name, mime: f.mimeType, size: f.size, folder: f.folder } })), done: true };
      } catch (e) {
        throw new Fail("transient", String((e as Error).message));
      }
    },
    async open(uid, fid, _item, from, signal) {
      const token = await tokenFor(uid, p);
      const r = await others.fetchFile(p, token, fid, { from, signal });
      if (r.ok) return r;
      const transient = r.status === 429 || r.status >= 500 || r.status === 408 || r.status === 401;
      throw new Fail(transient ? "transient" : "final", `${p}: ${r.status}`);
    },
  };
}

// A stand-in drive for testing the job end to end without Google: STASH_FAKE_DRIVE=1
// (never in production). STASH_FAKE_FLAKY=0.3 makes three in ten downloads fail.
export const FAKE_DRIVE = process.env.STASH_FAKE_DRIVE === "1" && process.env.VERCEL_ENV !== "production";
const fakeSource: Source = {
  async listStep() {
    const n = Number(process.env.STASH_FAKE_DRIVE_FILES ?? 40);
    const files: Listed[] = [];
    for (let i = 0; i < n; i++) {
      const size = i === 3 ? 9_500_000 : i === 7 ? 0 : 2_000 + ((i * 7919) % 60_000);
      files.push({ fid: `fake-${i}`, item: { name: i === 5 ? "gone.txt" : `file-${String(i).padStart(3, "0")}.txt`, mime: "text/plain", size, folder: i % 3 === 0 ? "" : i % 3 === 1 ? "School" : "School/Notes" } });
    }
    return { files, done: true };
  },
  async open(_uid, fid, item, from) {
    await sleep(Number(process.env.STASH_FAKE_DELAY_MS ?? 150));
    if (Math.random() < Number(process.env.STASH_FAKE_FLAKY ?? 0)) throw new Fail("transient", "fake network drop");
    if (item.name === "gone.txt") throw new Fail("final", "fake: notFound");
    const size = item.size || 1234;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (i + fid.length) % 251;
    const slice = bytes.subarray(from);
    return new Response(slice, { status: from ? 206 : 200 });
  },
};

const sourceFor = (p: CopyProvider): Source => (FAKE_DRIVE && p === "google-drive" ? fakeSource : p === "google-drive" ? googleSource : otherSource(p));

// ---- encryption: the same shape the browser makes ----

async function importKey(raw: string) {
  return webcrypto.subtle.importKey("raw", Buffer.from(raw, "base64url"), "AES-GCM", false, ["encrypt"]);
}
async function encryptBlock(key: CryptoKey, plain: Uint8Array) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const out = Buffer.alloc(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

// Reads with a dead-connection guard: a download that sends nothing for IDLE_MS is abandoned.
async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const idle = new Promise<never>((_, rej) => (t = setTimeout(() => rej(new Fail("transient", "download went quiet")), IDLE_MS)));
  try {
    return await Promise.race([reader.read(), idle]);
  } finally {
    clearTimeout(t);
  }
}

async function spend(uid: string, bytes: number) {
  const now = Math.floor(Date.now() / 1000);
  const hour = Math.floor(now / 3600);
  const used = await store().kvIncr(`rl:budget:${uid}:${hour}`, bytes);
  if (used > BUDGET_BYTES_PER_HOUR) throw new Fail("busy", "hourly budget", (hour + 1) * 3600 - now);
}

async function store1(uid: string, objectId: string, bytes: Buffer): Promise<StoredPart> {
  try {
    return await putObject(uid, objectId, `${objectId}.stash`, bytes);
  } catch (e) {
    if (e instanceof StorageBusy) throw new Fail("busy", "storage busy", e.retryAfterSeconds || 30);
    throw new Fail("transient", String((e as Error).message));
  }
}

// One file: download, encrypt in pieces, store, then add it to the drive.
async function copyOne(uid: string, p: CopyProvider, key: CryptoKey, row: QueueRow, src: Source, signal: AbortSignal) {
  const db = store();
  const { item } = row;
  const progress = row.progress ?? { id: newId(), parts: [] };
  let from = progress.parts.length * CHUNK_PLAIN_BYTES;
  const res = await src.open(uid, row.fid, item, from, signal);
  if (from > 0 && res.status !== 206) {
    // The other end can't start part-way: begin this file again.
    progress.parts = [];
    from = 0;
  }
  if (!res.body) throw new Fail("transient", "empty response");
  const reader = res.body.getReader();
  let buf = new Uint8Array(0);
  let total = from;
  let sinceSave = 0;
  const flush = async (plain: Uint8Array) => {
    await spend(uid, plain.length);
    const part = await store1(uid, `${progress.id}.p${progress.parts.length}`, await encryptBlock(key, plain));
    progress.parts.push(part);
    if (++sinceSave >= 5) {
      sinceSave = 0;
      await db.queueSave({ ...row, progress });
    }
  };
  try {
    for (;;) {
      if (signal.aborted) throw new Fail("transient", "run ended");
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await readChunk(reader);
      } catch (e) {
        throw e instanceof Fail ? e : new Fail("transient", "download broke off");
      }
      if (chunk.done) break;
      total += chunk.value.length;
      const next = new Uint8Array(buf.length + chunk.value.length);
      next.set(buf);
      next.set(chunk.value, buf.length);
      buf = next;
      // Keep a full piece back until more follows, so a file that fits one piece stays one piece.
      while (buf.length > CHUNK_PLAIN_BYTES) {
        await flush(buf.subarray(0, CHUNK_PLAIN_BYTES));
        buf = buf.slice(CHUNK_PLAIN_BYTES);
      }
      if (total > MAX_BYTES) throw new Fail("final", "too big");
    }
  } catch (e) {
    reader.cancel().catch(() => {});
    // Keep the pieces already stored, so the next try carries on from there.
    if (progress.parts.length) row.progress = progress;
    throw e;
  }
  let stored: Pick<StashFile, "tg" | "blob" | "parts">;
  if (!progress.parts.length) {
    await spend(uid, buf.length);
    const one = await store1(uid, progress.id, await encryptBlock(key, buf));
    stored = one.blob ? { blob: one.blob } : { tg: one.tg };
  } else {
    await flush(buf);
    stored = { parts: progress.parts };
  }
  const f: StashFile = {
    id: progress.id,
    uid,
    name: item.name.slice(0, 255),
    size: total,
    mime: item.mime || "application/octet-stream",
    folder: item.folder.replace(/^\/+|\/+$/g, ""),
    source: p,
    createdAt: Date.now(),
    encrypted: true,
    ...stored,
  };
  await db.addFile(f);
  await db.queueSave({ ...row, state: "done", item: { ...item, size: total }, progress: undefined, error: undefined });
  return f;
}

async function refreshCounts(uid: string, p: CopyProvider, patch: Partial<CopyRecord> = {}) {
  const c = await store().queueCounts(uid, p);
  const total = c.pending.n + c.done.n + c.failed.n + c.skipped.n;
  const bytes = c.pending.bytes + c.done.bytes + c.failed.bytes + c.skipped.bytes;
  const counts = { total, bytes, copied: c.done.n, copiedBytes: c.done.bytes, failed: c.failed.n, skipped: c.skipped.n };
  const cur = await getRecord(uid, p);
  if (!cur) return { counts: c, rec: null };
  // The counts are always true. Anything else (state, waits) only while the copy is still
  // moving, so files that land just after a Stop are counted but the Stop stands.
  const moving = cur.state === "listing" || cur.state === "running";
  const next: CopyRecord = moving ? { ...cur, ...counts, heartbeat: Date.now(), ...patch } : { ...cur, ...counts };
  await putRecord(uid, next);
  return { counts: c, rec: next };
}

// One run. Returns whether another should follow straight away.
export async function runStep(uid: string, p: CopyProvider): Promise<{ again: boolean; note: string }> {
  const db = store();
  const t0 = Date.now();
  if (!(await db.kvClaim(leaseKey(uid, p), t0 + RUN_MS + 60_000))) return { again: false, note: "another run holds it" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RUN_MS + 30_000);
  const left = () => RUN_MS - (Date.now() - t0);
  try {
    let rec: CopyRecord | null | undefined = await getRecord(uid, p);
    if (!rec || rec.mode !== "server" || (rec.state !== "running" && rec.state !== "listing")) return { again: false, note: "nothing to do" };

    const u = await db.getUser(uid);
    if (u.protection === "passcode" || !u.key) {
      // Locked accounts: only the browser holds the key. Hand over to it.
      await patchRecord(uid, p, { mode: "browser" });
      return { again: false, note: "passcode account: browser copies" };
    }
    const key = await importKey(u.key);
    const src = sourceFor(p);

    // Waiting out busy storage or an outage. Short waits are slept here; long ones are
    // slept in pieces across runs, so the chain stays alive without anyone visiting.
    const waitOut = async (r: CopyRecord) => {
      if (!r.waitUntil || r.waitUntil <= Date.now()) return true;
      const ms = Math.min(r.waitUntil - Date.now(), left() - 5_000);
      await patchRecord(uid, p, { heartbeat: Date.now() });
      if (ms > 0) await sleep(ms);
      return r.waitUntil <= Date.now();
    };
    if (!(await waitOut(rec))) return { again: true, note: "still waiting" };

    // Listing, a step at a time. Files already in Stash from this drive (an earlier copy,
    // in a browser or before a relist) count as done, matched by folder and name.
    let have: Map<string, number> | null = null;
    while (rec && rec.state === "listing" && left() > 30_000) {
      try {
        const step = await src.listStep(uid, rec, ctrl.signal);
        if (step.files.length) {
          if (!have) {
            have = new Map();
            for (const k of await db.sourceNames(uid, p)) have.set(k, (have.get(k) ?? 0) + 1);
          }
          const h = have;
          await db.queueAdd(
            uid,
            p,
            step.files.map((f) => {
              const k = `${f.item.folder}/${f.item.name}`;
              const n = h.get(k) ?? 0;
              if (n > 0) h.set(k, n - 1);
              return { ...f, done: n > 0 };
            }),
          );
        }
        const patch: Partial<CopyRecord> = { listCursor: rec.listCursor, listedFolders: rec.listedFolders, strikes: 0, waitUntil: undefined };
        if (step.done) Object.assign(patch, { state: "running", listCursor: undefined, listedFolders: undefined, listComplete: true });
        rec = (await refreshCounts(uid, p, patch)).rec;
        if (step.done) await db.kvDelete(foldersKey(uid, p));
      } catch (e) {
        const f = e instanceof Fail ? e : new Fail("transient", String(e));
        if (f.kind === "reconnect") {
          await patchRecord(uid, p, { state: "reconnect" });
          return { again: false, note: "needs reconnect" };
        }
        const strikes = (rec?.strikes ?? 0) + 1;
        rec = await patchRecord(uid, p, { strikes, waitUntil: Date.now() + backoff(strikes), waitReason: "offline" });
        return { again: strikes < 40, note: `listing: ${f.message}` };
      }
    }
    if (!rec || rec.state !== "running") return { again: !!rec && rec.state === "listing", note: "listing continues" };

    // Copying.
    while (left() > 20_000) {
      const fresh = await getRecord(uid, p);
      if (!fresh || fresh.state !== "running") return { again: false, note: `now ${fresh?.state}` };
      // After hours of outage the chain rests; the watchdog wakes it later.
      if (!(await waitOut(fresh))) return { again: (fresh.strikes ?? 0) < 40, note: "still waiting" };
      const rows = await db.queueNext(uid, p, BATCH);
      if (!rows.length) {
        await refreshCounts(uid, p, { state: "done", waitUntil: undefined, strikes: 0 });
        return { again: false, note: "done" };
      }
      let ok = 0;
      let outage = 0;
      let busyFor = 0;
      let reconnect = false;
      let last: CopyRecord["last"];
      const tried: { row: QueueRow; fail: Fail }[] = [];
      const queue = [...rows];
      await Promise.all(
        Array.from({ length: PARALLEL }, async () => {
          while (queue.length && !reconnect && !busyFor) {
            const row = queue.shift()!;
            if (row.item.size > MAX_BYTES) {
              await db.queueSave({ ...row, state: "skipped" });
              continue;
            }
            try {
              await copyOne(uid, p, key, row, src, ctrl.signal);
              ok++;
              last = { name: row.item.name, folder: row.item.folder };
            } catch (e) {
              const f = e instanceof Fail ? e : new Fail("transient", String((e as Error)?.message ?? e));
              if (f.kind === "reconnect") reconnect = true;
              else if (f.kind === "busy") busyFor = Math.max(busyFor, f.waitSeconds || 30);
              else if (f.kind === "transient") outage++;
              tried.push({ row, fail: f });
            }
          }
        }),
      );
      // Tries count against a file only when its neighbours got through: when everything
      // fails at once, it's the connection, not the file.
      for (const { row, fail } of tried) {
        const counts = fail.kind === "final" ? 10 : fail.kind === "transient" && ok > 0 ? 1 : 0;
        const attempts = row.attempts + counts;
        await db.queueSave({ ...row, attempts, state: attempts >= FINAL_AT ? "failed" : "pending", error: fail.message.slice(0, 200) });
      }
      if (reconnect) {
        await refreshCounts(uid, p, { state: "reconnect" });
        return { again: false, note: "needs reconnect" };
      }
      const patch: Partial<CopyRecord> = { ...(last ? { last } : {}) };
      if (busyFor) Object.assign(patch, { waitUntil: Date.now() + busyFor * 1000, waitReason: "busy" });
      else if (ok === 0 && outage > 0) {
        const strikes = (fresh.strikes ?? 0) + 1;
        Object.assign(patch, { strikes, waitUntil: Date.now() + backoff(strikes), waitReason: "offline" });
      } else Object.assign(patch, { strikes: 0, waitUntil: undefined, waitReason: undefined });
      await refreshCounts(uid, p, patch);
      if (ok) await bumpRev(uid);
    }
    return { again: true, note: "run time used" };
  } finally {
    clearTimeout(timer);
    await db.kvDelete(leaseKey(uid, p)).catch(() => {});
  }
}

// 15 s, 30 s, 1 min … up to 10 min between tries while the other end is unreachable.
const backoff = (strikes: number) => Math.min(10 * 60_000, 15_000 * 2 ** Math.min(strikes - 1, 6));

// The same stand-in drive for the browser copy's routes (passcode accounts), in testing only.
export async function fakeListing() {
  const { files } = await fakeSource.listStep("", {} as CopyRecord, new AbortController().signal);
  return files.map((f) => ({ id: f.fid, name: f.item.name, mimeType: f.item.mime, size: f.item.size, folder: f.item.folder }));
}
export async function fakeDownload(id: string): Promise<Response> {
  const all = await fakeListing();
  const f = all.find((x) => x.id === id);
  if (!f) return Response.json({ error: "Google: notFound" }, { status: 422 });
  try {
    return await fakeSource.open("", id, { name: f.name, mime: f.mimeType, size: f.size, folder: f.folder }, 0, new AbortController().signal);
  } catch (e) {
    const final = e instanceof Fail && e.kind === "final";
    return Response.json({ error: String((e as Error).message) }, { status: final ? 422 : 502 });
  }
}

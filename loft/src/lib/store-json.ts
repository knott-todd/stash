import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, emptyCounts, publicFile, type QueueRow, type FileStats, type LinkToken, type StashFile, type Migration, type Store, type User } from "./store";

// JSON-file backend for local development. One file, rewritten on every change.

type Data = {
  users: Record<string, User>;
  files: StashFile[];
  tokens: Record<string, LinkToken>;
  migrations: Record<string, Migration>;
  tgOffset: number;
  kv?: Record<string, unknown>;
  queue?: QueueRow[];
};

export function jsonStore(): Store {
  // Resolved here, not at module load: store.ts and this file import each other.
  const FILE = path.join(DATA_DIR, "store.json");
  let cache: Data | null = null;
  const load = (): Data => {
    if (cache) return cache;
    try {
      cache = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch {
      cache = { users: {}, files: [], tokens: {}, migrations: {}, tgOffset: 0 };
    }
    return cache!;
  };
  const save = () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
  };

  return {
    async getUser(uid) {
      const d = load();
      if (!d.users[uid]) {
        d.users[uid] = { uid, linked: true, createdAt: Date.now() };
        save();
      }
      return d.users[uid];
    },
    async saveUser(u) {
      delete u.googleList;
      load().users[u.uid] = u;
      save();
    },
    async findUserByEmail(email) {
      const d = load();
      const e = email.trim().toLowerCase();
      const matches = Object.values(d.users).filter((u) => u.email?.toLowerCase() === e);
      if (!matches.length) return undefined;
      const count = (uid: string) => d.files.filter((f) => f.uid === uid).length;
      return matches.sort((a, b) => count(b.uid) - count(a.uid) || b.createdAt - a.createdAt)[0];
    },
    async filesFor(uid) {
      return load()
        .files.filter((f) => f.uid === uid)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    async listFor(uid) {
      return (await this.filesFor(uid)).map(publicFile);
    },
    async fileStats(uid) {
      const out: FileStats = { count: 0, bytes: 0, byDevice: {}, bySource: {} };
      for (const f of load().files) {
        if (f.uid !== uid) continue;
        out.count++;
        out.bytes += f.size;
        out.bySource[f.source] = (out.bySource[f.source] ?? 0) + 1;
        if (f.deviceId) {
          const d = (out.byDevice[f.deviceId] ??= { files: 0, bytes: 0 });
          d.files++;
          d.bytes += f.size;
        }
      }
      return out;
    },
    async getFile(uid, id) {
      return load().files.find((f) => f.id === id && f.uid === uid);
    },
    async addFile(f) {
      load().files.push(f);
      save();
      return f;
    },
    async updateFile(f) {
      const d = load();
      const i = d.files.findIndex((x) => x.id === f.id && x.uid === f.uid);
      if (i >= 0) d.files[i] = f;
      save();
    },
    async deleteFile(uid, id) {
      const d = load();
      const i = d.files.findIndex((x) => x.id === id && x.uid === uid);
      if (i < 0) return undefined;
      const [f] = d.files.splice(i, 1);
      save();
      return f;
    },
    async moveFiles(from, to) {
      const d = load();
      let n = 0;
      for (const f of d.files) {
        if (f.uid !== from) continue;
        f.uid = to;
        n++;
      }
      if (n) save();
      return n;
    },
    async getToken(token) {
      return load().tokens[token];
    },
    async putToken(t) {
      load().tokens[t.token] = t;
      save();
    },
    async getMigration(uid) {
      return load().migrations[uid];
    },
    async putMigration(m) {
      load().migrations[m.uid] = m;
      save();
    },
    async getTgOffset() {
      return load().tgOffset;
    },
    async setTgOffset(n) {
      load().tgOffset = n;
      save();
    },
    async kvGet<T>(key: string) {
      return (load().kv ??= {})[key] as T | undefined;
    },
    async kvSet(key, value) {
      (load().kv ??= {})[key] = value;
      save();
    },
    async kvDelete(key) {
      delete (load().kv ??= {})[key];
      save();
    },
    async kvList(prefix) {
      return Object.entries(load().kv ??= {}).filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value }));
    },
    async kvIncr(key, by) {
      const kv = (load().kv ??= {});
      const n = (Number(kv[key]) || 0) + by;
      kv[key] = n;
      save();
      return n;
    },
    async reset(uid) {
      const d = load();
      d.files = d.files.filter((f) => f.uid !== uid);
      delete d.migrations[uid];
      const u = d.users[uid];
      if (u) {
        delete u.key;
        delete u.google;
        delete u.photoBackup;
      }
      for (const [k, t] of Object.entries(d.tokens)) if (t.uid === uid) delete d.tokens[k];
      delete (d.kv ??= {})[`glist:${uid}`];
      d.queue = (d.queue ?? []).filter((q) => q.uid !== uid);
      for (const k of Object.keys(d.kv ?? {})) if (k.startsWith(`copy:${uid}:`)) delete d.kv![k];
      save();
    },
    async kvClaim(key, until) {
      const kv = (load().kv ??= {});
      if (Number(kv[key] ?? 0) >= Date.now()) return false;
      kv[key] = until;
      save();
      return true;
    },
    async queueAdd(uid, provider, items) {
      const d = load();
      const q = (d.queue ??= []);
      const have = new Set(q.filter((r) => r.uid === uid && r.provider === provider).map((r) => r.fid));
      for (const x of items) if (!have.has(x.fid)) q.push({ uid, provider, fid: x.fid, state: x.done ? "done" : "pending", attempts: 0, item: x.item });
      save();
    },
    async queueNext(uid, provider, n) {
      const rank = (r: QueueRow) => [r.attempts, r.item.size === 0 ? 1 : 0, r.item.size];
      return (load().queue ?? [])
        .filter((r) => r.uid === uid && r.provider === provider && r.state === "pending")
        .sort((a, b) => {
          const x = rank(a);
          const y = rank(b);
          return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
        })
        .slice(0, n)
        .map((r) => structuredClone(r));
    },
    async queueSave(r) {
      const q = load().queue ?? [];
      const i = q.findIndex((x) => x.uid === r.uid && x.provider === r.provider && x.fid === r.fid);
      if (i >= 0) q[i] = structuredClone(r);
      save();
    },
    async queueCounts(uid, provider) {
      const out = emptyCounts();
      for (const r of load().queue ?? []) {
        if (r.uid !== uid || r.provider !== provider) continue;
        out[r.state].n++;
        out[r.state].bytes += r.item.size;
      }
      return out;
    },
    async queueRetryFailed(uid, provider) {
      for (const r of load().queue ?? []) {
        if (r.uid === uid && r.provider === provider && r.state === "failed") {
          r.state = "pending";
          r.attempts = 0;
        }
      }
      save();
    },
    async queueClear(uid, provider) {
      const d = load();
      d.queue = (d.queue ?? []).filter((r) => !(r.uid === uid && r.provider === provider));
      save();
    },
    async sourceNames(uid, source) {
      return load().files.filter((f) => f.uid === uid && f.source === source).map((f) => `${f.folder ?? ""}/${f.name}`);
    },
  };
}

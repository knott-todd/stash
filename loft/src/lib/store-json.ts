import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, type LinkToken, type StashFile, type Migration, type Store, type User } from "./store";

// JSON-file backend for local development. One file, rewritten on every change.

type Data = {
  users: Record<string, User>;
  files: StashFile[];
  tokens: Record<string, LinkToken>;
  migrations: Record<string, Migration>;
  tgOffset: number;
  kv?: Record<string, unknown>;
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
    async reset(uid) {
      const d = load();
      d.files = d.files.filter((f) => f.uid !== uid);
      delete d.migrations[uid];
      delete d.users[uid];
      for (const [k, t] of Object.entries(d.tokens)) if (t.uid === uid) delete d.tokens[k];
      delete (d.kv ??= {})[`glist:${uid}`];
      save();
    },
  };
}

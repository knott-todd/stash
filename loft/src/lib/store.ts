import fs from "node:fs";
import path from "node:path";

// Tiny JSON-file store. Good enough for a one-day demo; swap for SQLite/Postgres later.

export type LoftFile = {
  id: string;
  uid: string;
  name: string;
  size: number;
  mime: string;
  folder: string; // "" = root, "Photos", "Work/2024"
  source: "upload" | "google-drive" | "phone";
  createdAt: number;
  encrypted?: boolean; // ciphertext produced in the browser; server can't read it
  // storage pointer: telegram file_id, or local blob path in demo mode
  tg?: { fileId: string; messageId: number };
  blob?: string;
};

export type User = {
  uid: string;
  linked: boolean;
  firstName?: string;
  email?: string;
  tgChatId?: number;
  google?: { accessToken: string; refreshToken?: string; expiresAt: number };
  googleList?: { at: number; files: import("./google").GFile[] };
  createdAt: number;
  photoBackup?: { on: boolean; total: number; startedAt: number };
};

export type LinkToken = { token: string; uid: string; createdAt: number; used: boolean };

export type Migration = {
  uid: string;
  provider: "google-drive";
  startedAt: number;
  total: number;
  bytes: number;
  copied: number; // materialised files so far
  done: boolean;
};

type Data = {
  users: Record<string, User>;
  files: LoftFile[];
  tokens: Record<string, LinkToken>;
  migrations: Record<string, Migration>; // keyed by uid
  tgOffset: number;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "store.json");
export const BLOB_DIR = path.join(DATA_DIR, "blobs");

let cache: Data | null = null;

function load(): Data {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    cache = { users: {}, files: [], tokens: {}, migrations: {}, tgOffset: 0 };
  }
  return cache!;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
}

export const db = {
  get: load,
  save,
  user(uid: string): User {
    const d = load();
    if (!d.users[uid]) {
      // The device is the identity: a drive exists the moment someone arrives.
      d.users[uid] = { uid, linked: true, createdAt: Date.now() };
      save();
    }
    return d.users[uid];
  },
  filesFor(uid: string) {
    return load().files.filter((f) => f.uid === uid).sort((a, b) => b.createdAt - a.createdAt);
  },
  addFile(f: LoftFile) {
    load().files.push(f);
    save();
    return f;
  },
  reset(uid: string) {
    const d = load();
    d.files = d.files.filter((f) => f.uid !== uid);
    delete d.migrations[uid];
    delete d.users[uid];
    save();
  },
};

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

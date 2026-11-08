import path from "node:path";
import { jsonStore } from "./store-json";
import { pgStore } from "./store-pg";

// The catalogue: who owns which file and where its bytes went. Bytes live in
// storage (Telegram), the key lives on the device; this is only the index.
// Two backends behind one interface: a JSON file for local work, Postgres when
// DATABASE_URL is set (production on serverless hosts).

export type StashFile = {
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

export interface Store {
  getUser(uid: string): Promise<User>; // creates the drive on first sight
  saveUser(u: User): Promise<void>;
  filesFor(uid: string): Promise<StashFile[]>;
  getFile(uid: string, id: string): Promise<StashFile | undefined>;
  addFile(f: StashFile): Promise<StashFile>;
  updateFile(f: StashFile): Promise<void>;
  deleteFile(uid: string, id: string): Promise<StashFile | undefined>;
  getToken(token: string): Promise<LinkToken | undefined>;
  putToken(t: LinkToken): Promise<void>;
  getMigration(uid: string): Promise<Migration | undefined>;
  putMigration(m: Migration): Promise<void>;
  getTgOffset(): Promise<number>;
  setTgOffset(n: number): Promise<void>;
  reset(uid: string): Promise<void>; // forget a drive entirely
}

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
export const BLOB_DIR = path.join(DATA_DIR, "blobs");

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Chosen once per process. Both backends construct lazily, so the pg driver only
// opens a connection when DATABASE_URL is set.
let chosen: Store | null = null;
export function store(): Store {
  return (chosen ??= process.env.DATABASE_URL ? pgStore() : jsonStore());
}

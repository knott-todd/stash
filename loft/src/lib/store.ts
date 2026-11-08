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
  uid: string; // "g:<google sub>" for accounts
  linked: boolean;
  firstName?: string;
  email?: string;
  name?: string;
  picture?: string;
  // The account.s file key (AES-GCM, base64url). Files are encrypted in the browser
  // with it; it is handed to a device only after a sign-in.
  key?: string;
  tgChatId?: number;
  google?: { accessToken: string; refreshToken?: string; expiresAt: number };
  /** @deprecated moved to kv `glist:<uid>`; stripped on save */
  googleList?: unknown;
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
  // Sign-in from a new device: the drive that has this email on file (the one
  // with the most files if several devices registered the same address).
  findUserByEmail(email: string): Promise<User | undefined>;
  filesFor(uid: string): Promise<StashFile[]>;
  getFile(uid: string, id: string): Promise<StashFile | undefined>;
  addFile(f: StashFile): Promise<StashFile>;
  updateFile(f: StashFile): Promise<void>;
  deleteFile(uid: string, id: string): Promise<StashFile | undefined>;
  // Fold a pre-account device drive into an account.
  moveFiles(fromUid: string, toUid: string): Promise<number>;
  getToken(token: string): Promise<LinkToken | undefined>;
  putToken(t: LinkToken): Promise<void>;
  getMigration(uid: string): Promise<Migration | undefined>;
  putMigration(m: Migration): Promise<void>;
  getTgOffset(): Promise<number>;
  setTgOffset(n: number): Promise<void>;
  // Small short-lived values (device-approval handshakes). Never the key.
  kvGet<T>(key: string): Promise<T | undefined>;
  kvSet(key: string, value: unknown): Promise<void>;
  kvDelete(key: string): Promise<void>;
  reset(uid: string): Promise<void>; // forget every file and key; keeps who the account is
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

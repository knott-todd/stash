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
  source: "upload" | "google-drive" | "dropbox" | "onedrive" | "phone" | "desktop";
  createdAt: number;
  modifiedAt?: number; // the file's own modified time, when the source knows it (desktop backup)
  encrypted?: boolean; // ciphertext produced in the browser; server can't read it
  // Storage pointer for a file sent in one piece: telegram file_id, or a local blob path in demo mode.
  tg?: { fileId: string; messageId: number };
  blob?: string;
  // A file sent in pieces: each piece is its own stored object, in order. Pieces are
  // a fixed size (CHUNK_CIPHER_BYTES) except the last, so a reader needs no index.
  parts?: StoredPart[];
  // Small encrypted preview (images and videos), stored like a one-piece file.
  thumb?: StoredPart;
  deviceId?: string; // which linked device sent it
  // A public link: anyone holding the token can download the file (Standard accounts only).
  share?: { token: string; createdAt: number };
};

export type StoredPart = { tg?: { fileId: string; messageId: number }; blob?: string; size: number };

export { CHUNK_CIPHER_BYTES, CHUNK_PLAIN_BYTES } from "./files-limits";

export type User = {
  uid: string; // "g:<google sub>" for accounts
  linked: boolean;
  firstName?: string;
  email?: string;
  name?: string;
  picture?: string;
  // How the file key is kept. "standard": Stash holds it (`key`) and hands it to
  // any signed-in device. "passcode": Stash holds only a copy wrapped with a
  // passcode it never sees (`keyWrapped`); the browser unwraps it.
  protection?: "standard" | "passcode";
  key?: string; // AES-GCM key, base64url (standard mode)
  keyWrapped?: WrappedKey; // passcode mode
  tgChatId?: number;
  google?: { accessToken: string; refreshToken?: string; expiresAt: number };
  // Other drives connected for a move (Dropbox, OneDrive).
  providers?: Partial<Record<"dropbox" | "onedrive", { accessToken: string; refreshToken?: string; expiresAt: number }>>;
  /** @deprecated moved to kv `glist:<uid>`; stripped on save */
  googleList?: unknown;
  createdAt: number;
  photoBackup?: { on: boolean; total: number; startedAt: number };
};

// The file key encrypted with a key derived from the passcode (PBKDF2-SHA256).
export type WrappedKey = { salt: string; iv: string; ct: string; iter: number; hint?: string };

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
  filesFor(uid: string): Promise<StashFile[]>; // full rows, for server-side work only
  listFor(uid: string): Promise<PublicFile[]>; // what the browser sees
  fileStats(uid: string): Promise<FileStats>;
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
  kvList(prefix: string): Promise<{ key: string; value: unknown }[]>; // every key under a prefix (ledgers, sweeps)
  kvIncr(key: string, by: number): Promise<number>; // atomic counter; creates at 0
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

// What a listing carries: the catalogue row without storage pointers (piece
// lists can be kilobytes per file, and every byte read from the database is
// metered). Built in SQL on Postgres, mapped here for the JSON store.
export type PublicFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
  folder: string;
  source: StashFile["source"];
  createdAt: number;
  modifiedAt: number | null;
  encrypted: boolean;
  chunked: boolean;
  thumb: boolean;
  deviceId: string | null;
  shared: boolean;
  stored: boolean;
};

export const publicFile = (f: StashFile): PublicFile => ({
  id: f.id,
  name: f.name,
  size: f.size,
  mime: f.mime,
  folder: f.folder,
  source: f.source,
  createdAt: f.createdAt,
  modifiedAt: f.modifiedAt ?? null,
  encrypted: !!f.encrypted,
  chunked: !!f.parts?.length,
  thumb: !!f.thumb,
  deviceId: f.deviceId ?? null,
  shared: !!f.share,
  stored: !!(f.tg || f.blob || f.parts?.length),
});

// Counts without reading rows: the account total, per device, per source.
export type FileStats = { count: number; bytes: number; byDevice: Record<string, { files: number; bytes: number }>; bySource: Record<string, number> };

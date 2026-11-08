import { neon } from "@neondatabase/serverless";
import type { LinkToken, StashFile, Migration, Store, User } from "./store";

// Postgres backend (Neon over HTTP, so it works from serverless functions).
// Rows are small: the catalogue only, never file bytes or keys.

export function pgStore(): Store {
  // Tolerate a value pasted with the quotes .env files wrap it in.
  const sql = neon(process.env.DATABASE_URL!.trim().replace(/^["']|["']$/g, ""));
  let ready: Promise<void> | null = null;

  // Create tables on first use; cheap and idempotent.
  const ensure = () =>
    (ready ??= (async () => {
      await sql`CREATE TABLE IF NOT EXISTS users (
        uid text PRIMARY KEY,
        data jsonb NOT NULL,
        created_at bigint NOT NULL
      )`;
      await sql`CREATE TABLE IF NOT EXISTS files (
        id text PRIMARY KEY,
        uid text NOT NULL,
        created_at bigint NOT NULL,
        data jsonb NOT NULL
      )`;
      await sql`CREATE INDEX IF NOT EXISTS files_uid_idx ON files (uid, created_at DESC)`;
      await sql`CREATE TABLE IF NOT EXISTS tokens (
        token text PRIMARY KEY,
        uid text NOT NULL,
        data jsonb NOT NULL
      )`;
      await sql`CREATE TABLE IF NOT EXISTS migrations (uid text PRIMARY KEY, data jsonb NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, value jsonb NOT NULL)`;
    })());

  const rowFile = (r: Record<string, unknown>) => r.data as StashFile;

  return {
    async getUser(uid) {
      await ensure();
      const rows = await sql`SELECT data FROM users WHERE uid = ${uid}`;
      if (rows[0]) {
        const u = rows[0].data as User;
        if (u.googleList !== undefined) {
          // One-time move: the Drive listing used to live on the row and made
          // every request carry it. Park it in kv and shrink the row for good.
          await sql`INSERT INTO kv (key, value) VALUES (${"glist:" + uid}, ${JSON.stringify(u.googleList)}::jsonb)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
          delete u.googleList;
          await sql`UPDATE users SET data = data - 'googleList' WHERE uid = ${uid}`;
        }
        return u;
      }
      const u: User = { uid, linked: true, createdAt: Date.now() };
      await sql`INSERT INTO users (uid, data, created_at) VALUES (${uid}, ${JSON.stringify(u)}::jsonb, ${u.createdAt}) ON CONFLICT (uid) DO NOTHING`;
      return u;
    },
    async saveUser(u) {
      await ensure();
      delete u.googleList; // never back on the user row
      await sql`INSERT INTO users (uid, data, created_at) VALUES (${u.uid}, ${JSON.stringify(u)}::jsonb, ${u.createdAt})
                ON CONFLICT (uid) DO UPDATE SET data = EXCLUDED.data`;
    },
    async findUserByEmail(email) {
      await ensure();
      const rows = await sql`
        SELECT u.data FROM users u
        LEFT JOIN files f ON f.uid = u.uid
        WHERE lower(u.data->>'email') = ${email.trim().toLowerCase()}
        GROUP BY u.uid, u.data, u.created_at
        ORDER BY count(f.id) DESC, u.created_at DESC
        LIMIT 1`;
      return rows[0] ? (rows[0].data as User) : undefined;
    },
    async filesFor(uid) {
      await ensure();
      const rows = await sql`SELECT data FROM files WHERE uid = ${uid} ORDER BY created_at DESC`;
      return rows.map(rowFile);
    },
    async getFile(uid, id) {
      await ensure();
      const rows = await sql`SELECT data FROM files WHERE id = ${id} AND uid = ${uid}`;
      return rows[0] ? rowFile(rows[0]) : undefined;
    },
    async addFile(f) {
      await ensure();
      await sql`INSERT INTO files (id, uid, created_at, data) VALUES (${f.id}, ${f.uid}, ${f.createdAt}, ${JSON.stringify(f)}::jsonb)`;
      return f;
    },
    async updateFile(f) {
      await ensure();
      await sql`UPDATE files SET data = ${JSON.stringify(f)}::jsonb WHERE id = ${f.id} AND uid = ${f.uid}`;
    },
    async deleteFile(uid, id) {
      await ensure();
      const rows = await sql`DELETE FROM files WHERE id = ${id} AND uid = ${uid} RETURNING data`;
      return rows[0] ? rowFile(rows[0]) : undefined;
    },
    async getToken(token) {
      await ensure();
      const rows = await sql`SELECT data FROM tokens WHERE token = ${token}`;
      return rows[0] ? (rows[0].data as LinkToken) : undefined;
    },
    async putToken(t) {
      await ensure();
      await sql`INSERT INTO tokens (token, uid, data) VALUES (${t.token}, ${t.uid}, ${JSON.stringify(t)}::jsonb)
                ON CONFLICT (token) DO UPDATE SET data = EXCLUDED.data`;
    },
    async getMigration(uid) {
      await ensure();
      const rows = await sql`SELECT data FROM migrations WHERE uid = ${uid}`;
      return rows[0] ? (rows[0].data as Migration) : undefined;
    },
    async putMigration(m) {
      await ensure();
      await sql`INSERT INTO migrations (uid, data) VALUES (${m.uid}, ${JSON.stringify(m)}::jsonb)
                ON CONFLICT (uid) DO UPDATE SET data = EXCLUDED.data`;
    },
    async getTgOffset() {
      await ensure();
      const rows = await sql`SELECT value FROM kv WHERE key = 'tgOffset'`;
      return rows[0] ? Number(rows[0].value) : 0;
    },
    async setTgOffset(n) {
      await ensure();
      await sql`INSERT INTO kv (key, value) VALUES ('tgOffset', ${JSON.stringify(n)}::jsonb)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    },
    async kvGet<T>(key: string) {
      await ensure();
      const rows = await sql`SELECT value FROM kv WHERE key = ${key}`;
      return rows[0] ? (rows[0].value as T) : undefined;
    },
    async kvSet(key, value) {
      await ensure();
      await sql`INSERT INTO kv (key, value) VALUES (${key}, ${JSON.stringify(value)}::jsonb)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    },
    async kvDelete(key) {
      await ensure();
      await sql`DELETE FROM kv WHERE key = ${key}`;
    },
    async reset(uid) {
      await ensure();
      await sql`DELETE FROM files WHERE uid = ${uid}`;
      await sql`DELETE FROM migrations WHERE uid = ${uid}`;
      await sql`DELETE FROM tokens WHERE uid = ${uid}`;
      await sql`DELETE FROM users WHERE uid = ${uid}`;
      await sql`DELETE FROM kv WHERE key = ${"glist:" + uid}`;
    },
  };
}

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { BLOB_DIR, store, type StoredPart } from "./store";

const ownerTag = (uid: string) => createHash("sha256").update(uid).digest("base64url").slice(0, 16);

// Storage backend. Real mode talks to the Telegram Bot API: ciphertext is sent to a
// Stash-operated chat. Demo mode (no token) mimics the same shape with local blobs.
// Every stored object is at most one piece (≤ 4 MB from the browser, up to 20 MB
// from a server-side source); large files are many pieces.

export const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const DEMO = !TOKEN;

const api = (method: string) => `https://api.telegram.org/bot${TOKEN}/${method}`;

export class StorageBusy extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Storage is busy; retry in ${retryAfterSeconds}s`);
  }
}

async function call<T>(method: string, body?: BodyInit | object): Promise<T> {
  const init: RequestInit =
    body instanceof FormData
      ? { method: "POST", body }
      : { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined };
  const r = await fetch(api(method), init);
  const j = await r.json();
  if (!j.ok) {
    // Telegram rate-limits the bot as a whole. Short waits are absorbed here;
    // long ones become a StorageBusy error the API turns into a clear message.
    const wait = Number(j.parameters?.retry_after ?? 0);
    if (r.status === 429 && wait > 0 && wait <= 5 && !(body instanceof FormData)) {
      await new Promise((res) => setTimeout(res, wait * 1000 + 100));
      return call<T>(method, body);
    }
    if (r.status === 429) throw new StorageBusy(wait);
    throw new Error(`telegram ${method}: ${j.description}`);
  }
  return j.result as T;
}

// Operator-side: where ciphertext is stored. Users never interact with this.
// Set STASH_STORAGE_CHAT_ID in production. Without it, the chat is learned once from
// the first /start message the bot receives (fine for a single dev machine).
let storageChatId: number | null = process.env.STASH_STORAGE_CHAT_ID ? Number(process.env.STASH_STORAGE_CHAT_ID) : null;

export async function getStorageChatId() {
  if (DEMO) return null;
  if (storageChatId) return storageChatId;
  const db = store();
  let offset = await db.getTgOffset();
  type Upd = { update_id: number; message?: { text?: string; chat: { id: number } } };
  const updates = await call<Upd[]>("getUpdates", { offset, timeout: 0 });
  for (const u of updates) {
    offset = u.update_id + 1;
    if (u.message?.text?.startsWith("/start")) storageChatId = u.message.chat.id;
  }
  await db.setTgOffset(offset);
  return storageChatId;
}

// Store one object. The name is a label in the storage chat only.
export async function putObject(uid: string, objectId: string, name: string, bytes: Buffer): Promise<StoredPart> {
  const chatId = (await getStorageChatId().catch(() => null)) ?? (await store().getUser(uid)).tgChatId;
  if (DEMO || !chatId) {
    fs.mkdirSync(BLOB_DIR, { recursive: true });
    const p = path.join(BLOB_DIR, objectId);
    fs.writeFileSync(p, bytes);
    return { blob: p, size: bytes.length };
  }
  // The supplier learns nothing: no file name, no account id. The caption is a
  // one-way hash of the account so a recovery scan can still group objects.
  void name;
  const fd = new FormData();
  fd.set("chat_id", String(chatId));
  fd.set("caption", ownerTag(uid));
  fd.set("document", new Blob([new Uint8Array(bytes)]), `${objectId.replace(/[^A-Za-z0-9._-]/g, "")}.bin`);
  const r = await call<{ message_id: number; document: { file_id: string } }>("sendDocument", fd);
  return { tg: { fileId: r.document.file_id, messageId: r.message_id }, size: bytes.length };
}

// One-piece files keep the older row shape.
export async function putFile(uid: string, id: string, name: string, bytes: Buffer) {
  const p = await putObject(uid, id, name, bytes);
  return p.blob ? { blob: p.blob } : { tg: p.tg };
}

export async function objectStream(p: { tg?: { fileId: string }; blob?: string }): Promise<ReadableStream | null> {
  if (p.blob) {
    if (!fs.existsSync(p.blob)) return null;
    const bytes = fs.readFileSync(p.blob);
    return new Blob([new Uint8Array(bytes)]).stream();
  }
  if (p.tg) {
    const info = await call<{ file_path: string }>("getFile", { file_id: p.tg.fileId });
    const r = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${info.file_path}`);
    return r.body;
  }
  return null;
}

// The whole file: one piece, or every piece in order, as one stream.
export async function getFileStream(f: { tg?: { fileId: string }; blob?: string; parts?: StoredPart[] }): Promise<ReadableStream | null> {
  if (f.parts?.length) {
    const parts = f.parts;
    let i = 0;
    let current: ReadableStreamDefaultReader<Uint8Array> | null = null;
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        for (;;) {
          if (!current) {
            if (i >= parts.length) return controller.close();
            const s = await objectStream(parts[i++]);
            if (!s) return controller.error(new Error("piece missing"));
            current = s.getReader();
          }
          const { value, done } = await current.read();
          if (done) {
            current = null;
            continue;
          }
          controller.enqueue(value);
          return;
        }
      },
      cancel() {
        current?.cancel().catch(() => {});
      },
    });
  }
  return objectStream(f);
}

// Remove stored objects. Bot API can delete the bot's own messages in the storage chat.
export async function deleteStored(messageId: number) {
  if (DEMO) return;
  const chatId = await getStorageChatId();
  if (!chatId) return;
  await call("deleteMessage", { chat_id: chatId, message_id: messageId });
}

export async function deleteObjects(f: { tg?: { messageId: number }; blob?: string; parts?: StoredPart[]; thumb?: StoredPart }) {
  const all: { tg?: { messageId: number }; blob?: string }[] = [...(f.parts ?? []), ...(f.thumb ? [f.thumb] : []), { tg: f.tg, blob: f.blob }];
  for (const p of all) {
    if (p.blob) fs.rm(p.blob, { force: true }, () => {});
    if (p.tg) await deleteStored(p.tg.messageId).catch(() => {});
  }
}

import fs from "node:fs";
import path from "node:path";
import { BLOB_DIR, store } from "./store";

// Storage backend. Real mode talks to the Telegram Bot API: ciphertext is sent to a
// Stash-operated chat. Demo mode (no token) mimics the same shape with local blobs.

export const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const DEMO = !TOKEN;

const api = (method: string) => `https://api.telegram.org/bot${TOKEN}/${method}`;

async function call<T>(method: string, body?: BodyInit | object): Promise<T> {
  const init: RequestInit =
    body instanceof FormData
      ? { method: "POST", body }
      : { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined };
  const r = await fetch(api(method), init);
  const j = await r.json();
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description}`);
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

export async function putFile(uid: string, id: string, name: string, bytes: Buffer) {
  const chatId = (await getStorageChatId().catch(() => null)) ?? (await store().getUser(uid)).tgChatId;
  if (DEMO || !chatId) {
    fs.mkdirSync(BLOB_DIR, { recursive: true });
    const p = path.join(BLOB_DIR, id);
    fs.writeFileSync(p, bytes);
    return { blob: p };
  }
  const fd = new FormData();
  fd.set("chat_id", String(chatId));
  fd.set("caption", `${uid}/${name}`);
  fd.set("document", new Blob([new Uint8Array(bytes)]), name);
  const r = await call<{ message_id: number; document: { file_id: string } }>("sendDocument", fd);
  return { tg: { fileId: r.document.file_id, messageId: r.message_id } };
}

// Staged path: the browser put the ciphertext in a temporary *private* blob (only
// our server can read it). The server pulls it and sends it on to storage, then
// deletes the blob. Capped so one function invocation comfortably finishes.
export const STAGED_MAX_BYTES = 20 * 1024 * 1024;

export async function putFileFromUrl(uid: string, id: string, name: string, url: string) {
  const { get, del } = await import("@vercel/blob");
  try {
    const got = await get(url, { access: "private", useCache: false });
    if (!got || got.statusCode !== 200 || !got.stream) throw new Error("staged blob not readable");
    const bytes = Buffer.from(await new Response(got.stream).arrayBuffer());
    return putFile(uid, id, name, bytes);
  } finally {
    del(url).catch(() => {});
  }
}

export async function getFileStream(f: { tg?: { fileId: string }; blob?: string }): Promise<ReadableStream | null> {
  if (f.blob) {
    if (!fs.existsSync(f.blob)) return null;
    const bytes = fs.readFileSync(f.blob);
    return new Blob([new Uint8Array(bytes)]).stream();
  }
  if (f.tg) {
    const info = await call<{ file_path: string }>("getFile", { file_id: f.tg.fileId });
    const r = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${info.file_path}`);
    return r.body;
  }
  return null;
}

// Remove a stored object. Bot API can delete the bot's own messages in the storage chat.
export async function deleteStored(messageId: number) {
  if (DEMO) return;
  const chatId = await getStorageChatId();
  if (!chatId) return;
  await call("deleteMessage", { chat_id: chatId, message_id: messageId });
}

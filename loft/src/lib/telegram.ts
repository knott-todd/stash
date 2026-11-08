import fs from "node:fs";
import path from "node:path";
import { BLOB_DIR, db } from "./store";

// Storage backend. Real mode talks to the Telegram Bot API: files are sent to the
// user's private chat with the bot, so the user owns them even if Loft disappears.
// Demo mode (no token) mimics the same shape with local blobs and an auto-link.

export const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const DEMO = !TOKEN;
export const DEMO_BOT = "LoftDriveBot";

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

let botUsername: string | null = null;
export async function getBotUsername() {
  if (DEMO) return DEMO_BOT;
  if (!botUsername) botUsername = (await call<{ username: string }>("getMe")).username;
  return botUsername!;
}

// Operator-side: where ciphertext is stored. Users never interact with this.
// With a bot token, files go to a Loft-operated chat (LOFT_STORAGE_CHAT_ID, or the
// operator's own chat with the bot, learned from the first /start message).
let storageChatId: number | null = process.env.LOFT_STORAGE_CHAT_ID ? Number(process.env.LOFT_STORAGE_CHAT_ID) : null;

export async function getStorageChatId() {
  if (DEMO) return null;
  if (storageChatId) return storageChatId;
  const d = db.get();
  type Upd = { update_id: number; message?: { text?: string; chat: { id: number } } };
  const updates = await call<Upd[]>("getUpdates", { offset: d.tgOffset, timeout: 0 });
  for (const u of updates) {
    d.tgOffset = u.update_id + 1;
    if (u.message?.text?.startsWith("/start")) storageChatId = u.message.chat.id;
  }
  db.save();
  return storageChatId;
}

// Legacy per-user linking via /start <token>; kept for the "own chat" mode.
export async function pollLinks() {
  const d = db.get();
  if (DEMO) return;
  type Upd = { update_id: number; message?: { text?: string; chat: { id: number; first_name?: string } } };
  const updates = await call<Upd[]>("getUpdates", { offset: d.tgOffset, timeout: 0 });
  for (const u of updates) {
    d.tgOffset = u.update_id + 1;
    const m = u.message;
    const match = m?.text?.match(/^\/start\s+(\S+)/);
    if (!m || !match) continue;
    const t = d.tokens[match[1]];
    if (!t || t.used) continue;
    t.used = true;
    const user = db.user(t.uid);
    user.linked = true;
    user.firstName = m.chat.first_name ?? "there";
    user.tgChatId = m.chat.id;
    call("sendMessage", {
      chat_id: m.chat.id,
      text: "You're linked to Loft. Everything you add to Loft lands here, in your own chat. 📦",
    }).catch(() => {});
  }
  db.save();
}

export async function putFile(uid: string, id: string, name: string, bytes: Buffer) {
  const chatId = (await getStorageChatId().catch(() => null)) ?? db.user(uid).tgChatId;
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

import { createHash, randomBytes } from "node:crypto";
import { newId, store } from "./store";

// Linked devices: a computer running Stash Desktop or a phone running the app.
// Each holds a long-lived token (hashed here) that stands in for a session.
// Linking is a code the device shows and the signed-in browser approves.

export type DeviceFolder = { path: string; label: string; files: number; bytes: number; pending: number; failed: number; lastUpload?: number };
export type DeviceState = { status: "idle" | "scanning" | "uploading" | "paused" | "error"; detail?: string; folders: DeviceFolder[]; version?: string; updatedAt: number };
export type Device = {
  id: string;
  uid: string;
  name: string;
  platform: string; // "windows" | "macos" | "linux" | "ios" | "android"
  kind: "desktop" | "phone";
  createdAt: number;
  lastSeen: number;
  tokenHash: string;
  state?: DeviceState;
};

type Link = { linkId: string; secret: string; name: string; platform: string; kind: Device["kind"]; createdAt: number; approved?: { deviceId: string; token: string; email: string | null } };

const LINK_TTL = 15 * 60 * 1000;
const hash = (t: string) => createHash("sha256").update(t).digest("base64url");
const kDevice = (id: string) => `device:${id}`;
const kList = (uid: string) => `devices:${uid}`;
const kTok = (h: string) => `dtok:${h}`;
const kLink = (code: string) => `dlink:${code}`;
const kLinkId = (id: string) => `dlinkid:${id}`;

// Codes people read off a screen: no 0/O or 1/I.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode() {
  const b = randomBytes(6);
  return Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}

export async function startLink(name: string, platform: string, kind: Device["kind"]) {
  const db = store();
  const code = makeCode();
  const link: Link = { linkId: newId() + newId(), secret: randomBytes(16).toString("base64url"), name: name.slice(0, 60), platform: platform.slice(0, 20), kind, createdAt: Date.now() };
  await db.kvSet(kLink(code), link);
  await db.kvSet(kLinkId(link.linkId), code);
  return { code, linkId: link.linkId, secret: link.secret };
}

export async function peekLink(code: string) {
  const l = await store().kvGet<Link>(kLink(code.toUpperCase()));
  if (!l || Date.now() - l.createdAt > LINK_TTL) return null;
  return l;
}

// The signed-in browser says yes: the device is born and the token waits for it.
export async function approveLink(code: string, uid: string, email: string | null) {
  const db = store();
  const key = kLink(code.toUpperCase());
  const l = await db.kvGet<Link>(key);
  if (!l || Date.now() - l.createdAt > LINK_TTL || l.approved) return null;
  const token = randomBytes(32).toString("base64url");
  const d: Device = { id: newId() + newId(), uid, name: l.name, platform: l.platform, kind: l.kind, createdAt: Date.now(), lastSeen: Date.now(), tokenHash: hash(token) };
  await db.kvSet(kDevice(d.id), d);
  await db.kvSet(kTok(d.tokenHash), d.id);
  const ids = (await db.kvGet<string[]>(kList(uid))) ?? [];
  await db.kvSet(kList(uid), [...ids, d.id]);
  await db.kvSet(key, { ...l, approved: { deviceId: d.id, token, email } });
  return d;
}

// The device polls; once approved it collects the token exactly once.
export async function collectLink(linkId: string, secret: string) {
  const db = store();
  const code = await db.kvGet<string>(kLinkId(linkId));
  if (!code) return { state: "gone" as const };
  const l = await db.kvGet<Link>(kLink(code));
  if (!l || l.secret !== secret) return { state: "gone" as const };
  if (Date.now() - l.createdAt > LINK_TTL) {
    await db.kvDelete(kLink(code));
    await db.kvDelete(kLinkId(linkId));
    return { state: "expired" as const };
  }
  if (!l.approved) return { state: "waiting" as const, code };
  await db.kvDelete(kLink(code));
  await db.kvDelete(kLinkId(linkId));
  return { state: "approved" as const, token: l.approved.token, deviceId: l.approved.deviceId, email: l.approved.email };
}

export async function deviceForToken(token: string): Promise<Device | null> {
  const db = store();
  const id = await db.kvGet<string>(kTok(hash(token)));
  if (!id) return null;
  return (await db.kvGet<Device>(kDevice(id))) ?? null;
}

export async function getDevice(uid: string, id: string) {
  const d = await store().kvGet<Device>(kDevice(id));
  return d && d.uid === uid ? d : null;
}

export async function saveDevice(d: Device) {
  await store().kvSet(kDevice(d.id), d);
}

export async function listDevices(uid: string): Promise<Device[]> {
  const db = store();
  const ids = (await db.kvGet<string[]>(kList(uid))) ?? [];
  const out: Device[] = [];
  for (const id of ids) {
    const d = await db.kvGet<Device>(kDevice(id));
    if (d) out.push(d);
  }
  return out.sort((a, b) => b.lastSeen - a.lastSeen);
}

export async function revokeDevice(uid: string, id: string) {
  const db = store();
  const d = await getDevice(uid, id);
  if (!d) return false;
  await db.kvDelete(kTok(d.tokenHash));
  await db.kvDelete(kDevice(id));
  const ids = (await db.kvGet<string[]>(kList(uid))) ?? [];
  await db.kvSet(kList(uid), ids.filter((x) => x !== id));
  return true;
}

export const publicDevice = (d: Device, extra: { files: number; bytes: number }) => ({
  id: d.id,
  name: d.name,
  platform: d.platform,
  kind: d.kind,
  createdAt: d.createdAt,
  lastSeen: d.lastSeen,
  state: d.state ?? null,
  ...extra,
});

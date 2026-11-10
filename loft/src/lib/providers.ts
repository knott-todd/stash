import { store, type User } from "./store";

// Other cloud drives people move from. Each one: OAuth to get a read-only
// token, list everything with folder paths, fetch one file's bytes. The browser
// does the copying, exactly as for Google Drive. Keys come from the environment;
// a provider without keys is simply not offered.

export type ProviderId = "dropbox" | "onedrive";
export type Listed = { id: string; name: string; mimeType: string; size: number; folder: string };
export type Tokens = { accessToken: string; refreshToken?: string; expiresAt: number };

export const PROVIDERS: Record<ProviderId, { label: string; enabled: boolean }> = {
  dropbox: { label: "Dropbox", enabled: !!(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET) },
  onedrive: { label: "OneDrive", enabled: !!(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET) },
};

export const isProvider = (p: string): p is ProviderId => p === "dropbox" || p === "onedrive";

const redirect = (origin: string, p: ProviderId) => `${origin}/api/providers/${p}/callback`;

export function authUrl(p: ProviderId, origin: string, state: string) {
  if (p === "dropbox") {
    const q = new URLSearchParams({ client_id: process.env.DROPBOX_APP_KEY!, redirect_uri: redirect(origin, p), response_type: "code", token_access_type: "offline", state });
    return `https://www.dropbox.com/oauth2/authorize?${q}`;
  }
  const q = new URLSearchParams({ client_id: process.env.MS_CLIENT_ID!, redirect_uri: redirect(origin, p), response_type: "code", response_mode: "query", scope: "Files.Read offline_access", state });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${q}`;
}

async function tokenRequest(p: ProviderId, body: Record<string, string>): Promise<Tokens> {
  const url = p === "dropbox" ? "https://api.dropboxapi.com/oauth2/token" : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const creds = p === "dropbox" ? { client_id: process.env.DROPBOX_APP_KEY!, client_secret: process.env.DROPBOX_APP_SECRET! } : { client_id: process.env.MS_CLIENT_ID!, client_secret: process.env.MS_CLIENT_SECRET! };
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...creds, ...body }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? j.error ?? "token request failed");
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + Number(j.expires_in ?? 3600) * 1000 };
}

export function exchangeCode(p: ProviderId, origin: string, code: string) {
  return tokenRequest(p, { code, grant_type: "authorization_code", redirect_uri: redirect(origin, p) });
}

export async function accessTokenFor(p: ProviderId, uid: string): Promise<string | null> {
  const db = store();
  const u = await db.getUser(uid);
  const t = u.providers?.[p];
  if (!t) return null;
  if (Date.now() < t.expiresAt - 30_000) return t.accessToken;
  if (!t.refreshToken) return null;
  const n = await tokenRequest(p, { refresh_token: t.refreshToken, grant_type: "refresh_token" });
  u.providers![p] = { ...n, refreshToken: n.refreshToken ?? t.refreshToken };
  await db.saveUser(u);
  return u.providers![p]!.accessToken;
}

export async function saveTokens(uid: string, p: ProviderId, t: Tokens) {
  const db = store();
  const u = await db.getUser(uid);
  u.providers = { ...(u.providers ?? {}), [p]: t };
  await db.saveUser(u);
}

export async function disconnect(uid: string, p: ProviderId) {
  const db = store();
  const u = await db.getUser(uid);
  if (u.providers) delete u.providers[p];
  await db.saveUser(u);
  await db.kvDelete(`plist:${p}:${uid}`);
}

export const connected = (u: User) => ({ dropbox: !!u.providers?.dropbox, onedrive: !!u.providers?.onedrive });

const mimeFromName = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const m: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", heic: "image/heic", mp4: "video/mp4", mov: "video/quicktime", pdf: "application/pdf", txt: "text/plain", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", zip: "application/zip", mp3: "audio/mpeg" };
  return m[ext] ?? "application/octet-stream";
};

// Everything in the account, with folder paths relative to the root.
export async function listAll(p: ProviderId, token: string): Promise<Listed[]> {
  const out: Listed[] = [];
  if (p === "dropbox") {
    let r = await fetch("https://api.dropboxapi.com/2/files/list_folder", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ path: "", recursive: true, include_non_downloadable_files: false, limit: 2000 }) });
    for (;;) {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error_summary ?? "list failed");
      for (const e of j.entries as { ".tag": string; id: string; name: string; size?: number; path_display?: string }[]) {
        if (e[".tag"] !== "file") continue;
        const parts = (e.path_display ?? e.name).split("/").filter(Boolean);
        parts.pop();
        out.push({ id: e.id, name: e.name, mimeType: mimeFromName(e.name), size: Number(e.size ?? 0), folder: parts.join("/") });
      }
      if (!j.has_more) break;
      r = await fetch("https://api.dropboxapi.com/2/files/list_folder/continue", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ cursor: j.cursor }) });
    }
    return out;
  }
  // OneDrive: the delta feed walks the whole drive, folders included.
  let url: string | undefined = "https://graph.microsoft.com/v1.0/me/drive/root/delta?$select=id,name,size,file,folder,parentReference,deleted&$top=1000";
  while (url) {
    const r: Response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message ?? "list failed");
    for (const e of j.value as { id: string; name: string; size?: number; file?: { mimeType?: string }; folder?: unknown; deleted?: unknown; parentReference?: { path?: string } }[]) {
      if (!e.file || e.deleted) continue;
      // parentReference.path looks like "/drive/root:/Photos/2024"
      const raw = e.parentReference?.path ?? "";
      const folder = raw.includes("root:") ? decodeURIComponent(raw.split("root:")[1] ?? "").split("/").filter(Boolean).join("/") : "";
      out.push({ id: e.id, name: e.name, mimeType: e.file.mimeType ?? mimeFromName(e.name), size: Number(e.size ?? 0), folder });
    }
    url = j["@odata.nextLink"];
  }
  return out;
}

export async function fetchFile(p: ProviderId, token: string, id: string, init: { from?: number; signal?: AbortSignal } = {}): Promise<Response> {
  const range: Record<string, string> = init.from ? { range: `bytes=${init.from}-` } : {};
  if (p === "dropbox") {
    return fetch("https://content.dropboxapi.com/2/files/download", { method: "POST", headers: { authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({ path: id }), ...range }, signal: init.signal });
  }
  return fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(id)}/content`, { headers: { authorization: `Bearer ${token}`, ...range }, signal: init.signal });
}

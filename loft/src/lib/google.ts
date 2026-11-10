import { store } from "./store";

// Google OAuth, two jobs: sign-in (OpenID, who you are) and Drive read-only for
// the migration. Drive tokens are kept per account; file bytes pass through the
// server to the browser, which encrypts them before they go to storage.

export const GOOGLE_ENABLED = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export function googleAuthUrl(origin: string, state: string, o: { scope?: string; prompt?: string; loginHint?: string; offline?: boolean } = {}) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: "code",
    scope: o.scope ?? DRIVE_SCOPE,
    state,
  });
  if (o.offline) p.set("access_type", "offline");
  if (o.prompt) p.set("prompt", o.prompt);
  if (o.loginHint) p.set("login_hint", o.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(origin: string, code: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${origin}/api/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? j.error ?? "token exchange failed");
  return j as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };
}

async function refresh(refreshToken: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json().catch(() => ({}));
  // invalid_grant: the person took access back (or it lapsed). Anything else is worth retrying.
  if (!r.ok) throw new Error(j.error === "invalid_grant" ? "invalid_grant" : "refresh failed");
  return j as { access_token: string; expires_in: number };
}

export async function accessTokenFor(uid: string): Promise<string | null> {
  const db = store();
  const u = await db.getUser(uid);
  const g = u.google;
  if (!g) return null;
  if (Date.now() < g.expiresAt - 30_000) return g.accessToken;
  if (!g.refreshToken) return null;
  const t = await refresh(g.refreshToken);
  g.accessToken = t.access_token;
  g.expiresAt = Date.now() + t.expires_in * 1000;
  await db.saveUser(u);
  return g.accessToken;
}

// atRoot: the file is in a computer backup (Drive's "Computers"), not My Drive; its folders
// belong at the root of Stash, next to the device folders.
export type GFile = { id: string; name: string; mimeType: string; size: number; folder: string; exportAs?: string; atRoot?: boolean };

// Google-native docs have no bytes; export them to a portable format.
const EXPORTS: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": { mime: "application/pdf", ext: ".pdf" },
  "application/vnd.google-apps.spreadsheet": { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ".xlsx" },
  "application/vnd.google-apps.presentation": { mime: "application/pdf", ext: ".pdf" },
  "application/vnd.google-apps.drawing": { mime: "image/png", ext: ".png" },
};

export async function listAll(token: string): Promise<GFile[]> {
  type Raw = { id: string; name: string; mimeType: string; size?: string; parents?: string[] };
  const raw: Raw[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({
      q: "trashed = false",
      fields: "nextPageToken, files(id,name,mimeType,size,parents)",
      pageSize: "1000",
      spaces: "drive",
    });
    if (pageToken) p.set("pageToken", pageToken);
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?${p}`, { headers: { authorization: `Bearer ${token}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message ?? "list failed");
    raw.push(...j.files);
    pageToken = j.nextPageToken;
  } while (pageToken);

  // Rebuild folder paths from parent links.
  const byId = new Map(raw.map((f) => [f.id, f]));
  const FOLDER = "application/vnd.google-apps.folder";
  const pathOf = (f: Raw): string => {
    const parent = f.parents?.[0] ? byId.get(f.parents[0]) : undefined;
    if (!parent) return "";
    const up = pathOf(parent);
    return up ? `${up}/${parent.name}` : parent.name;
  };
  return raw
    .filter((f) => f.mimeType !== FOLDER)
    .filter((f) => f.mimeType.startsWith("application/vnd.google-apps.") ? EXPORTS[f.mimeType] : true)
    .map((f) => {
      const ex = EXPORTS[f.mimeType];
      return {
        id: f.id,
        name: ex ? f.name + ex.ext : f.name,
        mimeType: ex ? ex.mime : f.mimeType,
        size: Number(f.size ?? 0),
        folder: pathOf(f),
        exportAs: ex?.mime,
      };
    });
}

// The server-side copy lists in steps so a large Drive never outruns one function's time:
// every folder first (small), then the files a page at a time, each page placed by its folder.
const FOLDER_MIME = "application/vnd.google-apps.folder";
// device: a top-level folder you own that isn't in My Drive — a computer backed up by
// Google's desktop app (Drive's "Computers" section). Folders in My Drive have My Drive as parent.
export type GFolders = Record<string, { name: string; parent?: string; device?: boolean }>;

async function drivePage(token: string, q: string, fields: string, pageToken?: string, signal?: AbortSignal) {
  const p = new URLSearchParams({ q, fields: `nextPageToken, files(${fields})`, pageSize: "1000", spaces: "drive" });
  if (pageToken) p.set("pageToken", pageToken);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${p}`, { headers: { authorization: `Bearer ${token}` }, signal });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.error?.message ?? `list failed (${r.status})`) as Error & { status?: number };
    e.status = r.status;
    throw e;
  }
  return j as { nextPageToken?: string; files: { id: string; name: string; mimeType: string; size?: string; parents?: string[] }[] };
}

export async function listFolders(token: string, signal?: AbortSignal): Promise<GFolders> {
  const out: GFolders = {};
  let pageToken: string | undefined;
  do {
    const j = await drivePage(token, `trashed = false and mimeType = '${FOLDER_MIME}'`, "id,name,parents,ownedByMe", pageToken, signal);
    for (const f of j.files as { id: string; name: string; parents?: string[]; ownedByMe?: boolean }[])
      out[f.id] = { name: f.name, parent: f.parents?.[0], ...(!f.parents?.length && f.ownedByMe ? { device: true } : {}) };
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

// The names of the computer backups, which stay at the root of Stash.
export const deviceRootNames = (folders: GFolders) => [...new Set(Object.values(folders).filter((f) => f.device).map((f) => f.name))];

// Where a file sits: its folder path, and whether that path starts at a computer backup.
export function placeOf(folders: GFolders, parent: string | undefined): { path: string; device: boolean } {
  let top: string | undefined;
  const seen = new Set<string>();
  for (let id = parent; id && folders[id] && !seen.has(id); id = folders[id].parent) {
    seen.add(id);
    top = id;
  }
  return { path: folderPath(folders, parent), device: !!(top && folders[top].device) };
}

export function folderPath(folders: GFolders, parent: string | undefined): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (let id = parent; id && folders[id] && !seen.has(id); id = folders[id].parent) {
    seen.add(id);
    names.unshift(folders[id].name);
  }
  return names.join("/");
}

export async function listFilesPage(token: string, folders: GFolders, pageToken?: string, signal?: AbortSignal): Promise<{ files: GFile[]; next?: string }> {
  const j = await drivePage(token, `trashed = false and mimeType != '${FOLDER_MIME}'`, "id,name,mimeType,size,parents", pageToken, signal);
  const files = j.files
    .filter((f) => (f.mimeType.startsWith("application/vnd.google-apps.") ? EXPORTS[f.mimeType] : true))
    .map((f) => {
      const ex = EXPORTS[f.mimeType];
      const place = placeOf(folders, f.parents?.[0]);
      return { id: f.id, name: ex ? f.name + ex.ext : f.name, mimeType: ex ? ex.mime : f.mimeType, size: Number(f.size ?? 0), folder: place.path, exportAs: ex?.mime, ...(place.device ? { atRoot: true } : {}) };
    });
  return { files, next: j.nextPageToken };
}

// `from`: start part-way through (a large file resumed after an interruption). Exports can't.
export async function fetchFile(token: string, id: string, exportAs?: string, init: { from?: number; signal?: AbortSignal } = {}) {
  const url = exportAs
    ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(exportAs)}`
    : `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (init.from && !exportAs) headers.range = `bytes=${init.from}-`;
  return fetch(url, { headers, signal: init.signal });
}

// Google answers a refused download with a reason. Some are worth waiting out, the rest are final.
export async function googleRefusal(r: Response): Promise<{ retry: boolean; reason: string }> {
  const j = await r.json().catch(() => ({}));
  const reason: string = j.error?.errors?.[0]?.reason ?? j.error?.status ?? String(r.status);
  const retry = r.status === 429 || r.status >= 500 || r.status === 408 || /rateLimit|backendError|internalError|quotaExceeded/i.test(reason);
  return { retry, reason };
}

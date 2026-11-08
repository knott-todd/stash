import { db } from "./store";

// Google Drive, read-only. Tokens are kept server-side per device identity;
// file bytes pass through the server to the browser, which encrypts them before
// they go to storage. Google never sees Loft's key; Loft never sees plaintext at rest.

export const GOOGLE_ENABLED = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export function authUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
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
  return j as { access_token: string; refresh_token?: string; expires_in: number };
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
  const j = await r.json();
  if (!r.ok) throw new Error("refresh failed");
  return j as { access_token: string; expires_in: number };
}

export async function accessTokenFor(uid: string): Promise<string | null> {
  const u = db.user(uid);
  const g = u.google;
  if (!g) return null;
  if (Date.now() < g.expiresAt - 30_000) return g.accessToken;
  if (!g.refreshToken) return null;
  const t = await refresh(g.refreshToken);
  g.accessToken = t.access_token;
  g.expiresAt = Date.now() + t.expires_in * 1000;
  db.save();
  return g.accessToken;
}

export type GFile = { id: string; name: string; mimeType: string; size: number; folder: string; exportAs?: string };

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

export async function fetchFile(token: string, id: string, exportAs?: string) {
  const url = exportAs
    ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(exportAs)}`
    : `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
  return fetch(url, { headers: { authorization: `Bearer ${token}` } });
}

// What a copy from another drive looks like, shared by the server job and the pages. No Node imports.

export type CopyProvider = "google-drive" | "dropbox" | "onedrive";
export const COPY_PROVIDERS: CopyProvider[] = ["google-drive", "dropbox", "onedrive"];
export const isCopyProvider = (p: unknown): p is CopyProvider => typeof p === "string" && (COPY_PROVIDERS as string[]).includes(p);

export type CopyState = "listing" | "running" | "stopped" | "done" | "reconnect";
export type CopyRecord = {
  provider: CopyProvider;
  mode: "server" | "browser";
  state: CopyState;
  total: number;
  bytes: number;
  copied: number;
  copiedBytes: number;
  failed: number;
  skipped: number;
  startedAt: number;
  updatedAt: number;
  // Last sign of life from a run; the watchdog restarts a copy whose runs went quiet.
  heartbeat?: number;
  // Waiting out busy storage or a network outage: no tries before this time.
  waitUntil?: number;
  waitReason?: "busy" | "offline";
  strikes?: number; // outage rounds in a row, for the backoff
  last?: { name: string; folder: string };
  // Listing in steps: which page is next (Google), so a large Drive spans several runs.
  listCursor?: string;
  listedFolders?: boolean;
  listComplete?: boolean;
  // How the last call to start the next run went (202 = taken).
  handover?: { at: number; ok: boolean; status: number };
  // Files already in Stash from this drive have been put in place (provider folder, with
  // computer backups kept at the root). Done during the first step of reading the drive.
  settled?: boolean;
};

// The browser copy's share of the queue: one file to fetch, encrypt and store.
export type BrowserFile = { fid: string; item: { name: string; mime: string; size: number; folder: string; exportAs?: string; inProvider?: boolean }; attempts: number };

// Everything moved from another drive lives in a root folder named after it, next to
// the device folders: "Google Drive/School/Notes", not "School/Notes".
export const COPY_LABEL: Record<CopyProvider, string> = { "google-drive": "Google Drive", dropbox: "Dropbox", onedrive: "OneDrive" };
export const providerFolder = (p: CopyProvider, folder: string) => {
  const inner = folder.replace(/^\/+|\/+$/g, "");
  return inner ? `${COPY_LABEL[p]}/${inner}` : COPY_LABEL[p];
};

// The other way: where a file sat in the other drive, from where it is in Stash.
export const driveFolder = (p: CopyProvider, stashFolder: string) => (stashFolder === COPY_LABEL[p] ? "" : stashFolder.startsWith(COPY_LABEL[p] + "/") ? stashFolder.slice(COPY_LABEL[p].length + 1) : stashFolder);

// Where a queued file goes in Stash.
export const itemFolder = (p: CopyProvider, item: { folder: string; inProvider?: boolean }) => (item.inProvider ? item.folder : providerFolder(p, item.folder));

// What still isn't in Stash: everything not copied and not too big to copy.
export const remaining = (r: CopyRecord) => Math.max(0, r.total - r.copied - r.skipped);

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
};

// What still isn't in Stash: everything not copied and not too big to copy.
export const remaining = (r: CopyRecord) => Math.max(0, r.total - r.copied - r.skipped);

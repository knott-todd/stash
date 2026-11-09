"use client";

import { clearRawKey } from "./crypto";
import { cacheClear } from "./filecache";

// Sign out: the session ends on the server and this browser forgets the key,
// its local copies and any copy progress. Files stay in the account.
export async function signOutEverywhereHere(allBrowsers = false) {
  await fetch(allBrowsers ? "/api/auth/signout?all=1" : "/api/auth/signout", { method: "POST" }).catch(() => {});
  clearRawKey();
  for (const k of ["stash_gd_done_v1", "stash_dropbox_done_v1", "stash_onedrive_done_v1"]) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
  await cacheClear();
  location.href = "/signin";
}

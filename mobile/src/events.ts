// Local news between the background jobs and the screens: the Google Drive copy's progress
// (for the strip on My drive) and each photo the backup finishes (so Phone photos fills in
// as it goes). In memory only; nothing here leaves the phone.

import type { FileRow } from "./api";
import type { CopyState } from "./drivecopy";

type Fn<T> = (v: T) => void;
function channel<T>(initial: T) {
  let value = initial;
  const subs = new Set<Fn<T>>();
  return {
    get: () => value,
    set(v: T) {
      value = v;
      for (const f of subs) f(v);
    },
    on(f: Fn<T>) {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
}

export const copyNews = channel<CopyState | null>(null);
export const backupNews = channel<{ sending: boolean; last?: FileRow }>({ sending: false });

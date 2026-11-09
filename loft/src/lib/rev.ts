import { store } from "./store";

// A per-account catalogue revision: bumped on every change to the list of files
// (add, rename, move, trash, preview, folder, link). Pollers read the number,
// a few bytes, and fetch the catalogue only when it has moved.

export const bumpRev = (uid: string) => store().kvIncr(`rev:${uid}`, 1);
export const getRev = async (uid: string) => (await store().kvGet<number>(`rev:${uid}`)) ?? 0;

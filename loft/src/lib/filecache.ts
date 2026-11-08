"use client";

// Local copy of each file's ciphertext, keyed by file id, in the browser's Cache
// API. Opening a cached file is a decrypt, not a download. Only ciphertext is
// cached, so the "private" claim holds even for the on-device copy.

const NAME = "stash-files-v1";
const keyFor = (id: string) => `/stash-cache/${id}`;

function available() {
  return typeof caches !== "undefined";
}

export async function cachePut(id: string, bytes: Blob | ArrayBuffer) {
  if (!available()) return;
  try {
    const c = await caches.open(NAME);
    await c.put(keyFor(id), new Response(bytes));
  } catch {}
}

export async function cacheGet(id: string): Promise<ArrayBuffer | null> {
  if (!available()) return null;
  try {
    const c = await caches.open(NAME);
    const r = await c.match(keyFor(id));
    return r ? r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function cacheHas(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!available()) return out;
  try {
    const c = await caches.open(NAME);
    const keys = await c.keys();
    const present = new Set(keys.map((k) => new URL(k.url).pathname));
    for (const id of ids) if (present.has(keyFor(id))) out.add(id);
  } catch {}
  return out;
}

export async function cacheClear() {
  if (!available()) return;
  try {
    await caches.delete(NAME);
  } catch {}
}

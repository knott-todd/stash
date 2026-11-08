"use client";

import { Zip, ZipPassThrough } from "fflate";
import { decryptFile } from "./crypto";
import { cacheGet } from "./filecache";
import type { FileRow } from "@/components/Drive";

// Everything, as one zip of decrypted files with their folders. Streams
// straight to disk where the browser allows it (Chrome, Edge); elsewhere the
// zip is built in memory and handed over at the end.

export type ExportProgress = { done: number; total: number; bytes: number; name?: string; failed: string[] };

type Picker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable(): Promise<WritableStream<Uint8Array>> }>;

export async function exportAll(files: FileRow[], onProgress: (p: ExportProgress) => void, opts: { returnBlob?: boolean } = {}): Promise<Blob | null> {
  const list = files.filter((f) => f.stored);
  const picker = (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  const chunks: Uint8Array[] = [];
  if (picker && !opts.returnBlob) {
    const handle = await picker({ suggestedName: `Stash export ${new Date().toISOString().slice(0, 10)}.zip`, types: [{ description: "Zip archive", accept: { "application/zip": [".zip"] } }] });
    writer = (await handle.createWritable()).getWriter();
  }

  const zip = new Zip();
  let zipError: Error | null = null;
  const pending: Promise<void>[] = [];
  zip.ondata = (err, data, final) => {
    if (err) {
      zipError = err;
      return;
    }
    if (writer) pending.push(writer.write(data));
    else chunks.push(data);
    if (final && writer) pending.push(writer.close());
  };

  const progress: ExportProgress = { done: 0, total: list.length, bytes: 0, failed: [] };
  const seen = new Set<string>();
  for (const f of list) {
    progress.name = f.name;
    onProgress({ ...progress });
    try {
      let bytes = await cacheGet(f.id);
      if (!bytes) {
        const r = await fetch(`/api/files/${f.id}/download`);
        if (!r.ok) throw new Error("download");
        bytes = await r.arrayBuffer();
      }
      if (f.encrypted) bytes = await decryptFile(bytes, f.chunked);
      // Two files with one name in one folder: number the second.
      let path = f.folder ? `${f.folder}/${f.name}` : f.name;
      for (let n = 2; seen.has(path); n++) path = (f.folder ? `${f.folder}/` : "") + f.name.replace(/(\.[^.]*)?$/, ` (${n})$1`);
      seen.add(path);
      const entry = new ZipPassThrough(path);
      entry.mtime = new Date(f.modifiedAt ?? f.createdAt);
      zip.add(entry);
      entry.push(new Uint8Array(bytes), true);
      progress.bytes += bytes.byteLength;
    } catch {
      progress.failed.push(f.name);
    }
    progress.done++;
    onProgress({ ...progress });
    if (zipError) throw zipError;
    await Promise.all(pending.splice(0));
  }
  zip.end();
  await Promise.all(pending.splice(0));
  if (writer) return null;
  const blob = new Blob(chunks as BlobPart[], { type: "application/zip" });
  if (opts.returnBlob) return blob;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Stash export ${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return null;
}

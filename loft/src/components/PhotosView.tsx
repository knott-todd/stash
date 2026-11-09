"use client";

import { useMemo } from "react";
import { Thumb } from "./Thumb";
import type { FileRow } from "./Drive";

// Every picture and video in the account, newest first, by month. Wherever
// they live in folders, they are all here. The date is the file's own when a
// device knew it (phone and computer backups), otherwise when it arrived.

const when = (f: FileRow) => f.modifiedAt ?? f.createdAt;

export function PhotosView({ files, opening, onOpen }: { files: FileRow[]; opening: string | null; onOpen: (f: FileRow) => void }) {
  const groups = useMemo(() => {
    const media = files.filter((f) => f.stored && (f.mime.startsWith("image/") || f.mime.startsWith("video/"))).sort((a, b) => when(b) - when(a));
    const out: { label: string; items: FileRow[] }[] = [];
    for (const f of media) {
      const d = new Date(when(f));
      const label = d.toLocaleDateString([], { month: "long", year: "numeric" });
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(f);
      else out.push({ label, items: [f] });
    }
    return out;
  }, [files]);

  if (groups.length === 0) {
    return (
      <div className="card px-5 py-12 text-center">
        <p className="text-lg font-semibold">No photos or videos yet.</p>
        <p className="mt-1 text-ink-2">Pictures from your phone and computer gather here as they are backed up.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8" data-testid="photos">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h2 className="text-lg font-semibold mb-3">
            {g.label} <span className="text-sm font-normal text-ink-3">{g.items.length.toLocaleString()}</span>
          </h2>
          <ul className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-1.5">
            {g.items.map((f) => (
              <li key={f.id}>
                <button
                  className={`block w-full aspect-square rounded-lg overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${opening === f.id ? "opacity-60" : ""}`}
                  onClick={() => onOpen(f)}
                  title={f.name}
                  data-file-id={f.id}
                  aria-label={`Open ${f.name}`}
                >
                  <Thumb f={f} className="h-full w-full" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

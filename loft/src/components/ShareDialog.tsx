"use client";

import { useEffect, useState } from "react";
import { Dialog } from "./Protection";
import type { FileRow } from "./Drive";

// Get a link to one file. Made on open, copied with one click, removable.
export function ShareDialog({ f, onClose, onChanged }: { f: FileRow; onClose: () => void; onChanged: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/files/${f.id}/share`, { method: "POST" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Couldn't make a link.");
        setUrl(j.url);
        onChanged();
      })
      .catch((e) => setError(e.message));
  }, [f.id, onChanged]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  async function stop() {
    await fetch(`/api/files/${f.id}/share`, { method: "DELETE" });
    onChanged();
    onClose();
  }

  return (
    <Dialog title="Get link" onClose={onClose}>
      <p className="text-sm text-ink-2 break-words">
        Anyone with the link can download <span className="font-medium text-ink">{f.name}</span>. Remove it any time.
      </p>
      {error && (
        <p className="mt-3 text-sm text-accent-ink" role="alert">
          {error}
        </p>
      )}
      {url && (
        <div className="mt-4 flex gap-2">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm outline-none" aria-label="Link" data-testid="share-url" />
          <button className="btn-primary text-sm py-2" onClick={copy} data-testid="share-copy">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <div className="mt-5 flex justify-between gap-2">
        {url ? (
          <button className="text-sm text-ink-3 hover:text-ink underline underline-offset-4" onClick={stop} data-testid="share-stop">
            Remove link
          </button>
        ) : (
          <span />
        )}
        <button className="btn-ghost" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}

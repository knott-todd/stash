"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { decryptFile } from "@/lib/crypto";
import { cacheGet, cachePut } from "@/lib/filecache";
import { fmtBytes, fmtDate } from "@/lib/format";
import type { FileRow } from "./Drive";

// Pictures and videos open in place: a panel grows out of the tile over a
// dimmed page. Arrows and Esc move around; Download saves the original.

export function Lightbox({ items, index, from, onIndex, onClose, onDownload }: { items: FileRow[]; index: number; from?: DOMRect; onIndex: (i: number) => void; onClose: () => void; onDownload: (f: FileRow) => void }) {
  const f = items[index];
  const panel = useRef<HTMLDivElement>(null);

  // Grow out of the tile that was clicked: start the panel where the thumbnail is, then let it settle.
  useEffect(() => {
    const el = panel.current;
    if (!el || !from) return;
    const to = el.getBoundingClientRect();
    const s = Math.max(0.05, Math.min(from.width / to.width, from.height / to.height));
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
    el.style.opacity = "0.4";
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.transition = "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms ease-out";
        el.style.transform = "";
        el.style.opacity = "";
      }),
    );
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setUrl(null);
    setFailed(false);
    (async () => {
      try {
        let bytes = await cacheGet(f.id);
        if (!bytes) {
          const r = await fetch(`/api/files/${f.id}/download`);
          if (!r.ok) throw new Error("fetch");
          bytes = await r.arrayBuffer();
          cachePut(f.id, bytes);
        }
        if (f.encrypted) bytes = await decryptFile(bytes, f.chunked);
        if (!alive) return;
        made = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
        setUrl(made);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [f]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, items.length, onClose, onIndex]);

  const video = f.mime.startsWith("video/");
  return (
    <div className="fixed inset-0 z-[110] bg-ink/70 flex items-center justify-center p-4 sm:p-10 lightbox-in" onClick={onClose} role="dialog" aria-modal="true" aria-label={f.name} data-testid="lightbox">
      <div ref={panel} className={`relative max-w-full max-h-full flex flex-col items-center ${from ? "" : "lightbox-grow"}`} onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl overflow-hidden bg-black shadow-2xl flex items-center justify-center min-w-[16rem] min-h-[12rem]">
          {url && !video && <img src={url} alt={f.name} className="max-h-[80vh] max-w-[90vw] object-contain" />}
          {url && video && <video src={url} controls autoPlay className="max-h-[80vh] max-w-[90vw]" />}
          {!url && !failed && <span className="size-6 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-label="Loading" />}
          {failed && <p className="p-6 text-white text-sm">Couldn&apos;t open this one.</p>}
        </div>
        <div className="mt-3 flex items-center gap-4 text-sm text-white/90">
          <span className="truncate max-w-[50vw]" title={f.name}>
            {f.name}
          </span>
          <span className="text-white/60 whitespace-nowrap">
            {fmtBytes(f.size)} · {fmtDate(f.modifiedAt ?? f.createdAt)}
          </span>
          <button className="inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 px-3 py-1.5" onClick={() => onDownload(f)}>
            <Download size={16} /> Download
          </button>
        </div>
        <button className="absolute -top-3 -right-3 sm:top-2 sm:right-2 size-9 rounded-full bg-white text-ink flex items-center justify-center shadow" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      {index > 0 && (
        <button className="absolute left-3 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center" onClick={(e) => (e.stopPropagation(), onIndex(index - 1))} aria-label="Previous">
          <ChevronLeft size={22} />
        </button>
      )}
      {index < items.length - 1 && (
        <button className="absolute right-3 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center" onClick={(e) => (e.stopPropagation(), onIndex(index + 1))} aria-label="Next">
          <ChevronRight size={22} />
        </button>
      )}
    </div>
  );
}

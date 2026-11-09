"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { decryptFile } from "@/lib/crypto";
import { cacheGet, cachePut } from "@/lib/filecache";
import { fmtBytes, fmtDate } from "@/lib/format";
import type { FileRow } from "./Drive";

// Pictures and videos open in place. The thumbnail itself travels: it starts in its
// tile and scales up to where the picture will sit, the page dims over the same
// 380 ms, and the full picture fades in on top once it has arrived. Closing runs
// the same move backwards.

export type Origin = { rect: DOMRect; src?: string; aspect?: number };

const OPEN_MS = 440;
const CLOSE_MS = 280;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

// Ciphertext from the local copy or the server, then decrypted.
async function plainBytes(f: FileRow) {
  let bytes = await cacheGet(f.id);
  if (!bytes) {
    const r = await fetch(`/api/files/${f.id}/download`);
    if (!r.ok) throw new Error("fetch");
    bytes = await r.arrayBuffer();
    cachePut(f.id, bytes);
  }
  return f.encrypted ? decryptFile(bytes, f.chunked) : bytes;
}

const prefetched = new Set<string>();
function prefetch(f: FileRow) {
  if (!f.stored || prefetched.has(f.id)) return;
  prefetched.add(f.id);
  cacheGet(f.id).then((hit) => {
    if (hit) return;
    fetch(`/api/files/${f.id}/download`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => b && cachePut(f.id, b))
      .catch(() => {});
  });
}

function fit(aspect: number) {
  const maxW = Math.max(240, window.innerWidth - 96);
  const maxH = Math.max(180, window.innerHeight - 176);
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { w: Math.round(w), h: Math.round(h) };
}

export function Lightbox({ items, index, from, onIndex, onClose, onDownload }: { items: FileRow[]; index: number; from?: Origin; onIndex: (i: number) => void; onClose: () => void; onDownload: (f: FileRow) => void }) {
  const f = items[index];
  const video = f.mime.startsWith("video/");
  const [media, setMedia] = useState<{ url: string; video: boolean } | null>(null); // what is on screen; stays until the next one is ready
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(false); // the full picture has painted
  const [size, setSize] = useState(() => fit(from?.aspect ?? 4 / 3));
  const [phase, setPhase] = useState<"start" | "open" | "closing">(from ? "start" : "open");
  const box = useRef<HTMLDivElement>(null);
  const ghost = index === 0 && from?.src ? from.src : null; // the thumbnail only stands in for the item that was clicked
  const first = useRef(index);

  // Open: box sits at its final place but transformed onto the thumbnail; next frame, let go.
  useEffect(() => {
    if (!from) return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setPhase("open")));
    return () => cancelAnimationFrame(raf);
  }, [from]);

  function close() {
    if (!from || index !== first.current) return onClose();
    setPhase("closing");
    setTimeout(onClose, CLOSE_MS);
  }

  // Fetch, decrypt, hand the browser a real file. The picture already on screen stays
  // until the next one has decoded, so arrows never flash a loader; the spinner only
  // appears when the wait runs past 300 ms. Neighbours are fetched ahead.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setFailed(false);
    setSlow(false);
    const slowTimer = setTimeout(() => alive && setSlow(true), 300);
    (async () => {
      try {
        const bytes = await plainBytes(f);
        if (!alive) return;
        made = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
        if (!video) {
          const im = new Image();
          im.src = made;
          await im.decode().catch(() => {});
          if (!alive) return;
          if (im.naturalWidth && im.naturalHeight) setSize(fit(im.naturalWidth / im.naturalHeight));
        }
        clearTimeout(slowTimer);
        setSlow(false);
        setMedia({ url: made, video });
        setShown(true);
        for (const n of [items[index + 1], items[index - 1]]) if (n) prefetch(n);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      clearTimeout(slowTimer);
      if (made) setTimeout(() => URL.revokeObjectURL(made!), 1000); // after the swap has painted
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length, onIndex]);

  // Where the box rests, and the transform that puts it on the thumbnail.
  const left = Math.round((window.innerWidth - size.w) / 2);
  const top = Math.round((window.innerHeight - 56 - size.h) / 2);
  let onThumb = "";
  if (from) {
    const r = from.rect;
    const dx = r.left + r.width / 2 - (left + size.w / 2);
    const dy = r.top + r.height / 2 - (top + size.h / 2);
    onThumb = `translate(${dx}px, ${dy}px) scale(${r.width / size.w}, ${r.height / size.h})`;
  }
  const atThumb = phase !== "open";
  const ms = phase === "closing" ? CLOSE_MS : OPEN_MS;
  const chromeStyle = { opacity: atThumb ? 0 : 1, transition: `opacity ${ms}ms ease-out` } as const;

  return (
    <div
      className="fixed inset-0 z-[110] bg-ink/75"
      style={{ opacity: atThumb ? 0 : 1, transition: `opacity ${ms}ms ${EASE}` }}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={f.name}
      data-testid="lightbox"
      data-phase={phase}
    >
      <div
        ref={box}
        className="fixed overflow-hidden rounded-2xl bg-black shadow-2xl"
        style={{ left, top, width: size.w, height: size.h, transform: atThumb ? onThumb : "none", transformOrigin: "center", transition: `transform ${ms}ms ${EASE}, width 220ms ${EASE}, height 220ms ${EASE}, left 220ms ${EASE}, top 220ms ${EASE}` }}
        onClick={(e) => e.stopPropagation()}
        data-testid="lightbox-box"
      >
        {/* the thumbnail, standing in until the real picture has painted */}
        {ghost && <img src={ghost} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ opacity: shown ? 0 : 1 }} draggable={false} />}
        {media && !media.video && (
          <img
            src={media.url}
            alt={f.name}
            className="absolute inset-0 h-full w-full object-contain"
            style={{ opacity: shown ? 1 : 0 }}
            draggable={false}
          />
        )}
        {media && media.video && (
          <video
            src={media.url}
            controls
            autoPlay
            className="absolute inset-0 h-full w-full"
            style={{ opacity: shown ? 1 : 0 }}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setSize(fit(v.videoWidth / v.videoHeight));
              setShown(true);
            }}
          />
        )}
        {slow && !failed && <span className="absolute left-1/2 top-1/2 -ml-3 -mt-3 size-6 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-label="Loading" />}
        {failed && <p className="absolute inset-0 flex items-center justify-center text-white text-sm">Couldn&apos;t open this one.</p>}
      </div>

      <div className="fixed left-0 right-0 flex items-center justify-center gap-4 text-sm text-white/90 px-4" style={{ top: top + size.h + 14, ...chromeStyle }} onClick={(e) => e.stopPropagation()}>
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
      <button className="fixed top-4 right-4 size-9 rounded-full bg-white text-ink flex items-center justify-center shadow" style={chromeStyle} onClick={close} aria-label="Close">
        <X size={18} />
      </button>
      {index > 0 && (
        <button className="fixed left-3 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center" style={chromeStyle} onClick={(e) => (e.stopPropagation(), onIndex(index - 1))} aria-label="Previous">
          <ChevronLeft size={22} />
        </button>
      )}
      {index < items.length - 1 && (
        <button className="fixed right-3 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center" style={chromeStyle} onClick={(e) => (e.stopPropagation(), onIndex(index + 1))} aria-label="Next">
          <ChevronRight size={22} />
        </button>
      )}
    </div>
  );
}

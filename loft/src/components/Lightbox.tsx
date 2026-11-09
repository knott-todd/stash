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

export type Origin = { rect: DOMRect; src?: string; aspect?: number; radii?: [number, number, number, number] };

// Debug: add ?slow=8 to the page URL and every lightbox timing runs 8× slower.
const slowmo = () => {
  if (typeof location === "undefined") return 1;
  const n = Number(new URLSearchParams(location.search).get("slow"));
  return n > 0 ? n : 1;
};
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

// A picture ready to show: decrypted, decoded and downscaled to the screen's pixel size, so the
// box never has to rasterise a huge bitmap while it animates. Kept for the last few pictures
// so arrows are instant; the full file is only touched for Download.
type Ready = { url: string; w: number; h: number; video: boolean };
const ready = new Map<string, Promise<Ready>>();
const READY_MAX = 6;

function screenPixels() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return { w: Math.ceil(window.innerWidth * dpr), h: Math.ceil(window.innerHeight * dpr) };
}

function prepare(f: FileRow): Promise<Ready> {
  const hit = ready.get(f.id);
  if (hit) return hit;
  const p = (async (): Promise<Ready> => {
    const bytes = await plainBytes(f);
    const blob = new Blob([bytes], { type: f.mime });
    if (f.mime.startsWith("video/")) return { url: URL.createObjectURL(blob), w: 0, h: 0, video: true };
    const max = screenPixels();
    let bmp = await createImageBitmap(blob);
    const scale = Math.min(1, max.w / bmp.width, max.h / bmp.height);
    const w = bmp.width;
    const h = bmp.height;
    if (scale < 1 && typeof OffscreenCanvas !== "undefined") {
      const small = await createImageBitmap(blob, { resizeWidth: Math.round(w * scale), resizeHeight: Math.round(h * scale), resizeQuality: "high" });
      bmp.close();
      bmp = small;
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      c.getContext("2d")!.drawImage(bmp, 0, 0);
      bmp.close();
      const out = await c.convertToBlob({ type: "image/webp", quality: 0.92 });
      return { url: URL.createObjectURL(out), w, h, video: false };
    }
    bmp.close();
    return { url: URL.createObjectURL(blob), w, h, video: false };
  })();
  p.catch(() => ready.delete(f.id));
  ready.set(f.id, p);
  // drop the oldest beyond the limit
  if (ready.size > READY_MAX) {
    const oldest = ready.keys().next().value as string;
    ready.get(oldest)?.then((r) => URL.revokeObjectURL(r.url)).catch(() => {});
    ready.delete(oldest);
  }
  return p;
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
  const first = useRef(index);
  const ghost = index === first.current && from?.src ? from.src : null; // the thumbnail only stands in for the item that was clicked

  // Open: the box sits on the tile until the thumbnail inside it has painted (capped at 150 ms,
  // in case there is none), then lets go. Before that it is transparent, so the tile shows through
  // and there is no black frame.
  const [ghostReady, setGhostReady] = useState(!ghost);
  useEffect(() => {
    if (!from) return;
    if (!ghostReady) {
      const cap = setTimeout(() => setGhostReady(true), 150);
      return () => clearTimeout(cap);
    }
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setPhase("open")));
    return () => cancelAnimationFrame(raf);
  }, [from, ghostReady]);

  function close() {
    if (!from || index !== first.current) return onClose();
    setPhase("closing");
    setTimeout(onClose, CLOSE_MS * slowmo());
  }

  // Fetch, decrypt, hand the browser a real file. On arrows the picture already on screen stays,
  // dimmed with a spinner from the first frame, until the next one has decoded. On the first open
  // the thumbnail stands in, so the spinner only appears if the wait runs past 300 ms.
  // Neighbours are fetched ahead.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    const navigating = media !== null;
    setSlow(navigating);
    const slowTimer = setTimeout(() => alive && setSlow(true), navigating ? 0 : 300);
    (async () => {
      try {
        const r = await prepare(f);
        if (!alive) return;
        if (!r.video && r.w && r.h) setSize(fit(r.w / r.h));
        clearTimeout(slowTimer);
        setSlow(false);
        setMedia({ url: r.url, video: r.video });
        setShown(true);
        for (const n of [items[index + 1], items[index - 1]]) if (n?.stored) prepare(n).catch(() => {});
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      clearTimeout(slowTimer);
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

  // Where the box rests. On the thumbnail it takes the tile's real size, and the picture covers the
  // box throughout: at the tile's shape that is the tile's own centre crop, and as the box grows to
  // the picture's proportions the crop opens out until nothing is cropped. Size, not scale, so the
  // framing changes continuously and the full picture can take over in the same framing.
  // once the open move has finished, later size changes (arrows) are quick
  const [settled, setSettled] = useState(!from);
  useEffect(() => {
    if (phase !== "open") return;
    const t = setTimeout(() => setSettled(true), OPEN_MS * slowmo() + 50);
    return () => clearTimeout(t);
  }, [phase]);
  const atThumb = phase !== "open";
  const rest = { left: Math.round((window.innerWidth - size.w) / 2), top: Math.round((window.innerHeight - 56 - size.h) / 2), w: size.w, h: size.h };
  const geo = atThumb && from ? { left: from.rect.left, top: from.rect.top, w: from.rect.width, h: from.rect.height } : rest;
  const ms = (phase === "closing" ? CLOSE_MS : OPEN_MS) * slowmo();
  const chromeStyle = { opacity: atThumb ? 0 : 1, transition: `opacity ${ms}ms ease-out` } as const;

  return (
    <div
      className="fixed inset-0 z-[110]"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={f.name}
      data-testid="lightbox"
      data-phase={phase}
    >
      {/* The dim is its own layer, a sibling of the box, so the box never inherits its opacity. */}
      <div className="absolute inset-0 bg-ink/75" style={{ opacity: atThumb ? 0 : 1, transition: `opacity ${ms}ms ${EASE}` }} aria-hidden />
      <div
        ref={box}
        className={`fixed overflow-hidden rounded-2xl ${atThumb ? "" : "bg-black shadow-2xl"}`}
        style={{ left: geo.left, top: geo.top, width: geo.w, height: geo.h, borderRadius: atThumb && from ? (from.radii ?? [8, 8, 8, 8]).map((v) => `${v}px`).join(" ") : 16, transition: phase === "start" ? "none" : `left ${settled ? 320 : ms}ms ${EASE}, top ${settled ? 320 : ms}ms ${EASE}, width ${settled ? 320 : ms}ms ${EASE}, height ${settled ? 320 : ms}ms ${EASE}, border-radius ${ms}ms ${EASE}` }}
        onClick={(e) => e.stopPropagation()}
        data-testid="lightbox-box"
      >
        {/* the thumbnail, standing in until the real picture has painted */}
        {ghost && <img src={ghost} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ opacity: shown ? 0 : 1 }} onLoad={() => setGhostReady(true)} draggable={false} />}
        {media && !media.video && (
          <img
            src={media.url}
            alt={f.name}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: !shown ? 0 : slow ? 0.35 : 1, transition: "opacity 150ms ease-out" }}
            draggable={false}
          />
        )}
        {media && media.video && (
          <video
            src={media.url}
            controls
            autoPlay
            className="absolute inset-0 h-full w-full"
            style={{ opacity: !shown ? 0 : slow ? 0.35 : 1, transition: "opacity 150ms ease-out" }}
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

      <div className="fixed left-0 right-0 flex items-center justify-center gap-4 text-sm text-white/90 px-4" style={{ top: rest.top + rest.h + 14, ...chromeStyle }} onClick={(e) => e.stopPropagation()}>
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

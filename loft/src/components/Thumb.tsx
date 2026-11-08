"use client";

import { useEffect, useRef, useState } from "react";
import { FileTypeIcon } from "./FileTypeIcon";
import { fileIcon } from "@/lib/format";
import { thumbUrl } from "@/lib/thumbs";
import type { FileRow } from "./Drive";

// A file's picture, or its type icon while there is none. Loads only when on screen.
export function Thumb({ f, className = "" }: { f: FileRow; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const visual = f.mime.startsWith("image/") || f.mime.startsWith("video/");

  useEffect(() => {
    if (!visual || tried || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      setTried(true);
      thumbUrl(f).then(setUrl);
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [f, visual, tried]);

  return (
    <div ref={ref} className={`relative flex items-center justify-center overflow-hidden bg-cream-2 ${className}`}>
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <FileTypeIcon kind={fileIcon(f.mime, f.name)} className="text-ink-3 size-10" />
      )}
      {f.mime.startsWith("video/") && (
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-ink/70 text-white p-1" aria-hidden>
          <svg width="10" height="10" viewBox="0 0 14 14">
            <path d="M3.5 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5Z" fill="currentColor" />
          </svg>
        </span>
      )}
    </div>
  );
}

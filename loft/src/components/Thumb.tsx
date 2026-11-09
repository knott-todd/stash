"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { FileTypeIcon } from "./FileTypeIcon";
import { fileIcon } from "@/lib/format";
import { thumbUrl } from "@/lib/thumbs";
import type { FileRow } from "./Drive";

// A file's picture, or its type icon while there is none. Loads only when on screen.
export function Thumb({ f, className = "", small = false }: { f: FileRow; className?: string; small?: boolean }) {
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
        <FileTypeIcon kind={fileIcon(f.mime, f.name)} className={small ? "text-ink-2" : "text-ink-3 size-10"} />
      )}
      {f.mime.startsWith("video/") && !small && (
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-ink/70 text-white p-1" aria-hidden>
          <Play size={10} fill="currentColor" />
        </span>
      )}
    </div>
  );
}

import Link from "next/link";

// The Stash lockup: ladder-and-hatch mark + "Stash." (see public/brand/README.md).
// Everything is sized in em from the element's font-size F:
// mark 0.75em tall (the full height of Geist's "S" at F), word at 0.85em centred on the mark, gap 0.26em.
// The mark's bottom sits 0.07em below the baseline so the smaller word stays centred on it.
const MARK =
  "M7.68 43.6 Q0 50 10 50 L124 50 Q130 50 134.61 46.16 L182.32 6.4 Q190 0 180 0 L66 0 Q60 0 55.39 3.84 Z M0.74 61.86 Q0 60 2 60 L23.85 60 Q25.85 60 26.59 61.86 L38.31 91.14 Q39.05 93 41.05 93 L115.35 93 Q117.35 93 116.61 91.14 L104.89 61.86 Q104.15 60 106.15 60 L128 60 Q130 60 130.74 61.86 L189.26 208.14 Q190 210 188 210 L166.15 210 Q164.15 210 163.41 208.14 L151.69 178.86 Q150.95 177 148.95 177 L74.65 177 Q72.65 177 73.39 178.86 L85.11 208.14 Q85.85 210 83.85 210 L62 210 Q60 210 59.26 208.14 Z M49.39 118.86 Q48.65 117 50.65 117 L124.95 117 Q126.95 117 127.69 118.86 L140.61 151.14 Q141.35 153 139.35 153 L65.05 153 Q63.05 153 62.31 151.14 Z";

export function StashLockup({ className = "" }: { className?: string }) {
  return (
    <span className={`whitespace-nowrap leading-none font-normal ${className}`} style={{ letterSpacing: "-0.025em" }}>
      <svg
        viewBox="0 0 190 210"
        aria-hidden="true"
        focusable="false"
        style={{ display: "inline-block", height: "0.75em", width: "0.679em", verticalAlign: "-0.07em", marginRight: "0.26em" }}
      >
        <path fillRule="evenodd" fill="currentColor" d={MARK} />
      </svg>
      <span style={{ fontSize: "0.85em" }}>
        Stash<span style={{ color: "#1f45d8" }}>.</span>
      </span>
    </span>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center text-[22px] ${className}`} aria-label="Stash home">
      <StashLockup />
    </Link>
  );
}

import Link from "next/link";

// The Stash lockup: ladder-and-hatch mark + "Stash." (see public/brand/README.md).
// Everything is sized in em from the element's font-size F:
// a 1.3em rounded box (corners 9%) with the mark cut out at 70% of its height, word at 0.85em centred on the box, gap 0.32em.
// The word's ink centre is 0.305em above the baseline, so the box's bottom sits at 0.305 − 1.3/2 = −0.345em.
const MARK =
  "M7.68 43.6 Q0 50 10 50 L124 50 Q130 50 134.61 46.16 L182.32 6.4 Q190 0 180 0 L66 0 Q60 0 55.39 3.84 Z M0.74 61.86 Q0 60 2 60 L23.85 60 Q25.85 60 26.59 61.86 L38.31 91.14 Q39.05 93 41.05 93 L115.35 93 Q117.35 93 116.61 91.14 L104.89 61.86 Q104.15 60 106.15 60 L128 60 Q130 60 130.74 61.86 L189.26 208.14 Q190 210 188 210 L166.15 210 Q164.15 210 163.41 208.14 L151.69 178.86 Q150.95 177 148.95 177 L74.65 177 Q72.65 177 73.39 178.86 L85.11 208.14 Q85.85 210 83.85 210 L62 210 Q60 210 59.26 208.14 Z M49.39 118.86 Q48.65 117 50.65 117 L124.95 117 Q126.95 117 127.69 118.86 L140.61 151.14 Q141.35 153 139.35 153 L65.05 153 Q63.05 153 62.31 151.14 Z";

export function StashLockup({ className = "", boxed = true }: { className?: string; boxed?: boolean }) {
  return (
    <span className={`whitespace-nowrap leading-none font-normal ${className}`} style={{ letterSpacing: "-0.025em" }}>
      {boxed ? (
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        focusable="false"
        style={{ display: "inline-block", height: "1.3em", width: "1.3em", verticalAlign: "-0.345em", marginRight: "0.32em" }}
      >
        {/* The mark is cut out of the box, so whatever is behind the logo shows through it.
            Every instance defines the same mask, so a repeated id is harmless. */}
        <mask id="stash-mark-knockout">
          <rect width="100" height="100" fill="#fff" />
          <path fillRule="evenodd" fill="#000" transform="translate(18.33 15) scale(0.3333)" d={MARK} />
        </mask>
        <rect width="100" height="100" rx="9" fill="currentColor" mask="url(#stash-mark-knockout)" />
      </svg>
      ) : (
      // Unboxed: the bare mark, 1.125em tall; bottom at 0.305 − 1.125/2 = −0.258em.
      <svg
        viewBox="0 0 190 210"
        aria-hidden="true"
        focusable="false"
        style={{ display: "inline-block", height: "1.125em", width: "1.018em", verticalAlign: "-0.258em", marginRight: "0.32em" }}
      >
        <path fillRule="evenodd" fill="currentColor" d={MARK} />
      </svg>
      )}
      <span style={{ fontSize: "0.85em" }}>
        Stash<span style={{ color: "#1f45d8" }}>.</span>
      </span>
    </span>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center text-[28px] ${className}`} aria-label="Stash home">
      <StashLockup />
    </Link>
  );
}

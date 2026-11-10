"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "stash_experimental_seen_v1";

// Shown once per browser to people already in the drive, so accounts made before
// the landing page carried the notice see it too. Same words as the landing page.
export function ExperimentalNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== "1") setShow(true); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage exists only after mount
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  };
  return (
    <div
      className="card mb-5 px-4 py-3 flex flex-wrap items-start gap-x-5 gap-y-2 text-sm border-l-[3px] border-l-ink-2"
      role="region"
      aria-label="Early release"
      data-testid="experimental-notice"
    >
      <p className="flex-1 min-w-0 text-ink-2">
        <span className="font-semibold text-ink">Stash is an early experiment.</span> We work to keep every file safe,
        but can&apos;t promise anything will be kept forever. Keep another copy of anything you can&apos;t afford to
        lose.{" "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-ink">
          Terms
        </Link>
      </p>
      <button className="text-ink-3 hover:text-ink" onClick={dismiss} aria-label="Dismiss early release notice">
        Got it
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { phonePhotos } from "@/lib/demo-data";
import { adoptKeyFromFragment } from "@/lib/crypto";

type Status = { on: boolean; total: number; uploaded: number; done?: boolean };

// Phone-first screen. On a real device this would ask for photo-library access;
// in the demo the camera roll is drawn with gradients and uploads are simulated.
export function PhoneBackup() {
  const [s, setS] = useState<Status>({ on: false, total: 0, uploaded: 0 });
  const [asked, setAsked] = useState(false);

  async function poll() {
    setS(await fetch("/api/photos").then((r) => r.json()));
  }
  const [paired, setPaired] = useState(false);
  useEffect(() => {
    // Arrived by QR from a laptop? Adopt that drive and its key, then carry on.
    adoptKeyFromFragment();
    const t = new URLSearchParams(location.search).get("t");
    const ready = t ? fetch(`/api/claim?t=${encodeURIComponent(t)}`).then(() => setPaired(true)) : Promise.resolve();
    ready.then(poll);
  }, []);
  useEffect(() => {
    if (!s.on || s.done) return;
    const t = setInterval(poll, 700);
    return () => clearInterval(t);
  }, [s.on, s.done]);

  async function start() {
    setAsked(true);
    setS(await fetch("/api/photos", { method: "POST", body: "{}" }).then((r) => r.json()));
  }
  async function newPhoto() {
    setS(await fetch("/api/photos", { method: "POST", body: JSON.stringify({ action: "new-photo" }) }).then((r) => r.json()));
  }

  const count = Math.max(phonePhotos.length, s.total);

  return (
    <main className="flex-1 flex flex-col mx-auto w-full max-w-md">
      <header className="px-5 py-5 flex items-center justify-between">
        <Logo />
        <Link href="/drive" className="text-sm text-ink-2 hover:text-ink">
          My drive →
        </Link>
      </header>

      <section className="px-5 pb-4">
        {!s.on ? (
          <>
            {paired && (
              <p className="rise mb-3 inline-flex items-center gap-2 rounded-full bg-ok-soft text-ok px-3 py-1 text-sm font-medium" role="status">
                Linked to your drive
              </p>
            )}
            <h1 className="rise text-4xl font-semibold text-balance">Never lose a photo again.</h1>
            <p className="rise-2 mt-2 text-ink-2">Every photo you take is backed up. Encrypted on this phone before it leaves.</p>
            <button className="btn-primary rise-3 mt-6 w-full" onClick={start} data-testid="backup-photos">
              Back up my photos
            </button>
            <p className="mt-3 text-center text-sm text-ink-3">{phonePhotos.length} photos found on this phone</p>
          </>
        ) : (
          <div className="card p-4" role="status" aria-live="polite" data-testid="backup-status">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{s.done ? "All backed up." : "Backing up…"}</p>
              <p className="text-sm text-ink-2">
                {s.uploaded} of {s.total}
              </p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-cream-2 overflow-hidden">
              <div
                className="h-full bg-ok transition-all duration-500"
                style={{ width: `${s.total ? (s.uploaded / s.total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-ink-2">
              {s.done ? "New photos will back up automatically." : "You can close this. It keeps going."}
            </p>
          </div>
        )}
      </section>

      <section className="px-3 pb-6 grid grid-cols-3 gap-1.5" aria-label="Camera roll">
        {Array.from({ length: count }, (_, i) => {
          const p = phonePhotos[i % phonePhotos.length];
          const backedUp = s.on && i < s.uploaded;
          const isNew = i >= phonePhotos.length;
          return (
            <div
              key={i}
              className="relative aspect-square rounded-xl overflow-hidden"
              style={{
                // Neutral placeholders for the camera roll; a touch of variation so it reads as photos.
                background: isNew ? "#d4d4d4" : `hsl(0 0% ${86 + (p.hue % 7)}%)`,
              }}
              aria-label={backedUp ? "Backed up" : "Not backed up"}
            >
              {backedUp && (
                <span className="absolute bottom-1.5 right-1.5 size-5 rounded-full bg-ok text-white text-xs flex items-center justify-center shadow">
                  ✓
                </span>
              )}
            </div>
          );
        })}
      </section>

      {s.on && (
        <div className="px-5 pb-10">
          <button className="btn-ghost w-full border border-line" onClick={newPhoto} data-testid="take-photo">
            Simulate a new photo
          </button>
          <p className="mt-2 text-center text-xs text-ink-3">Demo control. On a phone this happens on its own.</p>
        </div>
      )}

      {asked && !s.on && <p className="px-5 text-sm text-ink-2">Allow photo access to continue…</p>}
    </main>
  );
}

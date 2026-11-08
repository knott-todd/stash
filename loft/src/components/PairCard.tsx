"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { pairingUrl, recoveryCode } from "@/lib/crypto";

// One card, two jobs: reach these files on another device (email link or QR),
// and show the recovery code once. The key only ever travels in the URL fragment.
export function PairCard({
  mode,
  email,
  onClose,
}: {
  mode: "card" | "qr";
  email: string | null;
  onClose: (dismissForGood?: boolean) => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [value, setValue] = useState(email ?? "");
  const [sent, setSent] = useState(false);
  const [showCode, setShowCode] = useState(false);

  async function mint(target: "qr" | "email") {
    const r = await fetch("/api/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(target === "email" ? { email: value } : {}),
    });
    const { token } = await r.json();
    const url = pairingUrl(target === "qr" ? "/m" : `/claim/${token}`, token);
    if (target === "qr") setQr(await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#1c1917", light: "#fffbf5" } }));
    else {
      setLink(url);
      setSent(true);
    }
  }

  useEffect(() => {
    if (mode === "qr") mint("qr");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div className="card mb-5 p-5 rise" role="region" aria-label="Open on another device" data-testid="pair-card">
      {mode === "qr" ? (
        <div className="flex flex-col sm:flex-row items-center gap-5">
          {qr ? <img src={qr} alt="Code to open Loft on your phone" width={180} height={180} className="rounded-xl" /> : <div className="size-[180px] rounded-xl bg-cream-2" />}
          <div className="flex-1">
            <h2 className="text-xl font-semibold">Point your phone camera here.</h2>
            <p className="mt-1 text-ink-2">Loft opens on your phone already linked to this drive. Then one tap: Back up my photos.</p>
            <p className="mt-2 text-sm text-ink-3">No app to install. No sign-in.</p>
            <button className="btn-ghost mt-3 px-0" onClick={() => onClose()}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-xl font-semibold">Want these on your phone or another computer?</h2>
          <p className="mt-1 text-ink-2">Add your email and we send a link. No password.</p>
          {!sent ? (
            <form
              className="mt-3 flex flex-col sm:flex-row gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (value.includes("@")) mint("email");
              }}
            >
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="flex-1 rounded-full border border-line bg-white px-5 py-3 text-base focus-visible:outline-4 focus-visible:outline-accent/40"
                aria-label="Email"
              />
              <button type="submit" className="btn-primary py-3 text-base">
                Send link
              </button>
              <button type="button" className="btn-ghost" onClick={() => onClose(true)}>
                Not now
              </button>
            </form>
          ) : (
            <div className="mt-3 text-sm">
              <p className="font-semibold">Link sent to {value}.</p>
              <p className="text-ink-2 mt-1">
                Demo: email isn&apos;t wired up, so here it is.{" "}
                <a className="underline break-all" href={link!}>
                  {link}
                </a>
              </p>
              <button className="btn-ghost mt-2 px-0" onClick={() => onClose()}>
                Done
              </button>
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-line">
            {qr ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <img src={qr} alt="Code to open Loft on your phone" width={140} height={140} className="rounded-xl" />
                <p className="text-ink-2">
                  <span className="block font-semibold text-ink">Point your phone camera here.</span>
                  Loft opens on your phone already linked to this drive, ready to back up your photos.
                </p>
              </div>
            ) : (
              <button className="btn-ghost border border-line" onClick={() => mint("qr")} data-testid="pair-qr">
                Scan with your phone instead
              </button>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-line text-sm">
            <button className="underline" onClick={() => setShowCode((s) => !s)}>
              {showCode ? "Hide recovery code" : "Show recovery code"}
            </button>
            {showCode && (
              <p className="mt-2">
                <code className="font-mono text-base tracking-wider bg-cream-2 rounded-lg px-3 py-1.5 inline-block">{recoveryCode()}</code>
                <span className="block mt-1 text-ink-2">Write this down. It opens your files if you lose every device. Loft doesn&apos;t have a copy.</span>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

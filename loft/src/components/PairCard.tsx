"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Reach these files on another device: sign in with the same Google account
// there. The code only carries the address of the sign-in page.
export function PairCard({ mode, email, onClose }: { mode: "card" | "qr"; email: string | null; onClose: (dismissForGood?: boolean) => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [addr, setAddr] = useState("");

  useEffect(() => {
    const url = `${location.origin}/signin`;
    setAddr(location.host); // eslint-disable-line react-hooks/set-state-in-effect -- window only exists after mount
    QRCode.toDataURL(url, { margin: 1, width: 180, color: { dark: "#1c1917", light: "#fffbf5" } }).then(setQr);
  }, []);

  return (
    <div className="card mb-5 p-5 rise" role="region" aria-label="Open on another device" data-testid="pair-card">
      <div className="flex flex-col sm:flex-row items-center gap-5">
        {qr ? <img src={qr} alt="Code that opens the Stash sign-in page" width={180} height={180} className="rounded-xl" /> : <div className="size-[180px] rounded-xl bg-cream-2" />}
        <div className="flex-1">
          <h2 className="text-xl font-semibold">{mode === "qr" ? "Point your phone camera here." : "Want these on your phone or another computer?"}</h2>
          <p className="mt-1 text-ink-2">
            Go to <span className="font-semibold text-ink">{addr}</span> on the other device and sign in{email ? ` as ${email}` : " with the same Google account"}. Your files are there. Nothing to install.
          </p>
          <div className="mt-3 flex gap-3">
            <button className="btn-ghost px-0" onClick={() => onClose()}>
              Close
            </button>
            {mode === "card" && (
              <button className="btn-ghost px-0 text-ink-3" onClick={() => onClose(true)}>
                Don&apos;t show this again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

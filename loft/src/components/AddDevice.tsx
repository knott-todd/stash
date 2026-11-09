"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Laptop, Mail, Smartphone } from "lucide-react";
import { AppHeader } from "./AppHeader";

// Link a device. The device being added always finishes the link on itself; this
// page only hands it the address. It guesses the two most likely intents from the
// platform of this browser, whether this browser approved a computer before, and
// what is already linked, and puts those two first.

const INSTALLER = "https://github.com/knott-todd/stash/releases/latest/download/Stash-Setup.exe";
export const LINKED_HERE_KEY = "stash_linked_computer_here";

type Intent = "this-computer" | "my-phone" | "another-computer" | "this-phone" | "my-computer" | "another-phone";

function isPhone() {
  return typeof navigator !== "undefined" && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches));
}

export function AddDevice() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState(false);
  const [computerLinked, setComputerLinked] = useState(false);
  const [phoneLinked, setPhoneLinked] = useState(false);
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/devices");
      if (r.status === 401) return router.replace("/signin?next=/devices/add");
      const j = await r.json();
      let here = false;
      try {
        here = localStorage.getItem(LINKED_HERE_KEY) === "1";
      } catch {}
      setPhone(isPhone());
      setComputerLinked(here || (j.devices as { kind: string }[]).some((d) => d.kind === "desktop"));
      setPhoneLinked(j.phoneFiles > 0 || (j.devices as { kind: string }[]).some((d) => d.kind === "phone"));
      setOrigin(location.origin);
      setQr(await QRCode.toDataURL(`${location.origin}/signin?next=%2Fm&from=laptop`, { margin: 1, width: 200, color: { dark: "#111111", light: "#ffffff" } }));
      setReady(true);
    })();
  }, [router]);

  // The two most likely intents, in order, for this situation.
  const order: Intent[] = phone ? (phoneLinked ? ["my-computer", "another-phone"] : ["this-phone", "my-computer"]) : computerLinked ? ["my-phone", "another-computer"] : ["this-computer", "my-phone"];
  const rest: Intent[] = (["this-computer", "my-phone", "another-computer", "this-phone", "my-computer", "another-phone"] as Intent[]).filter((i) => !order.includes(i) && (phone ? i !== "this-computer" && i !== "my-phone" : i !== "this-phone" && i !== "my-computer"));
  const mailto = `mailto:?subject=${encodeURIComponent("Stash for your computer")}&body=${encodeURIComponent(`Install Stash on your computer to keep it backed up:\n\n${INSTALLER}\n\nOpen it, click "Link this computer", and say yes in your browser.`)}`;

  const card = (intent: Intent, primary: boolean) => {
    const base = `card p-5 flex gap-4 ${primary ? "border-ink" : ""}`;
    const icon = intent.includes("phone") ? <Smartphone size={26} strokeWidth={1.5} /> : <Laptop size={26} strokeWidth={1.5} />;
    const btn = primary ? "btn-primary text-sm py-2.5" : "btn-ghost border border-line text-ink text-sm py-2.5";
    switch (intent) {
      case "this-computer":
        return (
          <div className={base} key={intent} data-testid="intent-this-computer">
            <span className="text-ink-2 shrink-0">{icon}</span>
            <div className="flex-1">
              <h2 className="font-semibold">This computer</h2>
              <p className="text-sm text-ink-2 mt-0.5">Download Stash, open it, click Link this computer, tick the folders. Windows now; Mac next.</p>
              <a className={`${btn} mt-3 inline-flex`} href={INSTALLER} data-testid="download-windows">
                Download for Windows
              </a>
            </div>
          </div>
        );
      case "my-phone":
      case "another-phone":
        return (
          <div className={base} key={intent} data-testid={`intent-${intent}`}>
            <span className="text-ink-2 shrink-0">{icon}</span>
            <div className="flex-1 flex flex-wrap gap-4 items-start">
              <div className="flex-1 min-w-[12rem]">
                <h2 className="font-semibold">{intent === "my-phone" ? "My phone" : "Another phone"}</h2>
                <p className="text-sm text-ink-2 mt-0.5">Point its camera at this code. Stash opens there; sign in with the same Google account and tap Back up photos.</p>
              </div>
              {qr && <img src={qr} alt="Code for the phone" width={120} height={120} className="rounded-lg border border-line" />}
            </div>
          </div>
        );
      case "another-computer":
      case "my-computer":
        return (
          <div className={base} key={intent} data-testid={`intent-${intent}`}>
            <span className="text-ink-2 shrink-0">{icon}</span>
            <div className="flex-1">
              <h2 className="font-semibold">{intent === "my-computer" ? "My computer" : "Another computer"}</h2>
              <p className="text-sm text-ink-2 mt-0.5">Send yourself the installer link and open it on that computer.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a className={`${btn} inline-flex items-center gap-2`} href={mailto}>
                  <Mail size={16} /> Email me the link
                </a>
                <button
                  className="btn-ghost border border-line text-ink text-sm py-2.5"
                  onClick={() => navigator.clipboard?.writeText(INSTALLER).catch(() => {})}
                >
                  Copy link
                </button>
              </div>
            </div>
          </div>
        );
      case "this-phone":
        return (
          <div className={base} key={intent} data-testid="intent-this-phone">
            <span className="text-ink-2 shrink-0">{icon}</span>
            <div className="flex-1">
              <h2 className="font-semibold">This phone</h2>
              <p className="text-sm text-ink-2 mt-0.5">Pick photos once; each is encrypted here before it leaves. Automatic backup needs the Stash app, which is next.</p>
              <Link className={`${btn} mt-3 inline-flex`} href="/m">
                Back up this phone&apos;s photos
              </Link>
            </div>
          </div>
        );
    }
  };

  return (
    <main className="flex-1 flex flex-col">
      <AppHeader active="devices" />
      <div className="mx-auto w-full max-w-3xl px-5 pb-24 flex-1">
        <Link href="/devices" className="text-sm text-ink-2 hover:text-ink">
          ← Devices
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">Link a device</h1>
        <p className="mt-1 text-ink-2">The device you add does the rest on itself; this page just gets it started.</p>
        {ready ? (
          <>
            <div className="mt-6 grid gap-3">{order.map((i, n) => card(i, n === 0))}</div>
            {rest.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-ink-3 hover:text-ink">Something else</summary>
                <div className="mt-3 grid gap-3">{rest.map((i) => card(i, false))}</div>
              </details>
            )}
            <p className="mt-6 text-xs text-ink-3">
              Site: {origin.replace(/^https?:\/\//, "")}. Windows may warn about an unsigned installer the first time; choose More info, then Run anyway.
            </p>
          </>
        ) : (
          <p className="mt-6 text-ink-3">Loading</p>
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "./Logo";
import { ProtectionChoice } from "./Protection";

// The browser side of linking: shows what is asking, one button to say yes.
// From the phone app (?from=app) the page is opened right after Google sign-in on
// the same phone: a brand-new account makes its one decision here first, then one
// tap links the phone and the page hands control back to the app (stash://linked).
export function LinkDevice() {
  const params = useSearchParams();
  const router = useRouter();
  const fromApp = params.get("from") === "app";
  const [code, setCode] = useState(params.get("code") ?? "");
  const [ask, setAsk] = useState<{ name: string; platform: string; kind: string } | null>(null);
  const [state, setState] = useState<"idle" | "looking" | "ready" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ email?: string | null; protection?: string | null } | null>(null);

  async function look(c: string) {
    setState("looking");
    setError(null);
    const r = await fetch(`/api/devices/link/approve?code=${encodeURIComponent(c)}`);
    if (r.status === 401) return router.replace(`/signin?next=${encodeURIComponent(`/devices/link?code=${c}${fromApp ? "&from=app" : ""}`)}`);
    const j = await r.json();
    if (!r.ok) {
      setError(j.error ?? "That code didn't work.");
      setState("error");
      return;
    }
    setAsk(j);
    setMe(await fetch("/api/me").then((x) => x.json()).catch(() => ({})));
    setState("ready");
  }

  useEffect(() => {
    const c = params.get("code");
    if (c) look(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, from the URL
  }, []);

  async function approve() {
    const r = await fetch("/api/devices/link/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error ?? "That didn't work.");
      setState("error");
      return;
    }
    // This browser just approved a computer: remember it for the next "Link a device" guess.
    try {
      if (ask?.kind !== "phone") localStorage.setItem("stash_linked_computer_here", "1");
    } catch {}
    setState("done");
    if (fromApp) setTimeout(() => (location.href = "stash://linked"), 400);
  }

  const needsChoice = state === "ready" && me && !me.protection;

  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-5xl px-5 py-5">
        <Logo />
      </header>
      <section className={`mx-auto w-full ${needsChoice ? "max-w-3xl" : "max-w-md"} px-5 pb-16`}>
        {state === "done" ? (
          <>
            <h1 className="text-3xl font-semibold">Linked.</h1>
            {fromApp ? (
              <>
                <p className="mt-2 text-ink-2">This phone backs up to your account from now on. Go back to the Stash app.</p>
                <a href="stash://linked" className="btn-primary mt-6 inline-flex" data-testid="back-to-app">
                  Back to the app
                </a>
              </>
            ) : (
              <>
                <p className="mt-2 text-ink-2">{ask?.name ?? "The device"} can now back up to this account. Go back to it to choose folders.</p>
                <Link href="/devices" className="btn-primary mt-6 inline-flex">
                  See my devices
                </Link>
              </>
            )}
          </>
        ) : needsChoice ? (
          <>
            <p className="text-sm text-ink-3">One question before your photos</p>
            <h1 className="mt-2 text-4xl font-semibold">How private should your files be?</h1>
            <p className="mt-3 text-lg text-ink-2">Every file is encrypted before it is stored either way. You can change this later in Settings.</p>
            <div className="mt-8">
              <ProtectionChoice current={null} onChanged={() => setMe((m) => ({ ...m, protection: "chosen" }))} />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold">{fromApp ? "Link this phone" : "Link a device"}</h1>
            {!fromApp && <p className="mt-2 text-ink-2">Type the code the device is showing.</p>}
            {!fromApp && (
              <form
                className="mt-5 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.trim()) look(code.trim().toUpperCase());
                }}
              >
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABCD23"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={6}
                  aria-label="Device code"
                  className="flex-1 rounded-full border border-line bg-white px-5 py-3 text-lg tracking-[0.3em] font-mono outline-none focus:border-ink"
                  data-testid="link-code"
                />
                <button type="submit" className="btn-ghost border border-line" disabled={state === "looking"}>
                  Find
                </button>
              </form>
            )}
            {state === "looking" && fromApp && <p className="mt-2 text-ink-2">One moment.</p>}
            {error && (
              <p className="mt-3 text-sm text-accent-ink" role="alert">
                {error}
              </p>
            )}
            {ask && state === "ready" && (
              <div className="card mt-5 p-5" data-testid="link-ask">
                <p className="text-lg font-semibold">{ask.name}</p>
                <p className="text-ink-2">
                  {fromApp
                    ? `Back up this phone's photos to ${me?.email ?? "your account"}?`
                    : `${ask.kind === "phone" ? "A phone" : "A computer"} (${ask.platform}) wants to send files to your account. Only say yes if this is yours.`}
                </p>
                <button className="btn-primary mt-4 w-full" onClick={approve} data-testid="link-approve">
                  {fromApp ? "Yes, back up this phone" : "Yes, link it"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

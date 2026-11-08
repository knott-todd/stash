"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "./Logo";

// The browser side of linking: shows what is asking, one button to say yes.
export function LinkDevice() {
  const params = useSearchParams();
  const router = useRouter();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [ask, setAsk] = useState<{ name: string; platform: string; kind: string } | null>(null);
  const [state, setState] = useState<"idle" | "looking" | "ready" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function look(c: string) {
    setState("looking");
    setError(null);
    const r = await fetch(`/api/devices/link/approve?code=${encodeURIComponent(c)}`);
    if (r.status === 401) return router.replace(`/signin?next=${encodeURIComponent(`/devices/link?code=${c}`)}`);
    const j = await r.json();
    if (!r.ok) {
      setError(j.error ?? "That code didn't work.");
      setState("error");
      return;
    }
    setAsk(j);
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
    setState("done");
  }

  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-5xl px-5 py-5">
        <Logo />
      </header>
      <section className="mx-auto w-full max-w-md px-5 pb-16">
        {state === "done" ? (
          <>
            <h1 className="text-3xl font-semibold">Linked.</h1>
            <p className="mt-2 text-ink-2">{ask?.name ?? "The device"} can now back up to this account. Go back to it to choose folders.</p>
            <Link href="/devices" className="btn-primary mt-6 inline-flex">
              See my devices
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold">Link a device</h1>
            <p className="mt-2 text-ink-2">Type the code the device is showing.</p>
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
            {error && (
              <p className="mt-3 text-sm text-accent-ink" role="alert">
                {error}
              </p>
            )}
            {ask && state === "ready" && (
              <div className="card mt-5 p-5" data-testid="link-ask">
                <p className="text-lg font-semibold">{ask.name}</p>
                <p className="text-ink-2">
                  {ask.kind === "phone" ? "A phone" : "A computer"} ({ask.platform}) wants to send files to your account. Only say yes if this is yours.
                </p>
                <button className="btn-primary mt-4 w-full" onClick={approve} data-testid="link-approve">
                  Yes, link it
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

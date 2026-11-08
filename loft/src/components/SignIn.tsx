"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";

// Sign in = tell Stash which drive is yours. One field, one button.
export function SignIn() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setError(null);
    const r = await fetch("/api/signin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error ?? "Something went wrong. Try again.");
      setState("idle");
      return;
    }
    setLink(j.link ?? null);
    setState("sent");
  }

  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-5xl px-5 py-5">
        <Logo />
      </header>
      <section className="mx-auto w-full max-w-md px-5 pt-8 pb-16">
        <h1 className="text-3xl font-semibold">Sign in</h1>
        {state !== "sent" ? (
          <>
            <p className="mt-2 text-ink-2">Enter the email you gave Stash. We send a link that opens your drive on this device.</p>
            <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-full border border-line bg-white px-5 py-3 text-base outline-none focus:border-ink"
                aria-label="Email"
                data-testid="signin-email"
              />
              <button type="submit" className="btn-primary" disabled={state === "busy"} data-testid="signin-send">
                {state === "busy" ? "Sending" : "Send me a link"}
              </button>
              {error && <p className="text-sm text-accent-ink">{error}</p>}
            </form>
            <p className="mt-6 text-sm text-ink-3">
              New here? There is nothing to sign up for.{" "}
              <Link href="/drive" className="underline">
                Start a drive
              </Link>
              .
            </p>
          </>
        ) : (
          <div className="mt-4" role="status">
            <p className="text-ink-2">If Stash has a drive for that email, a link is on its way. Open it on this device.</p>
            {link && (
              <p className="mt-3 text-sm text-ink-2">
                Email isn&apos;t set up here, so:{" "}
                <a href={link} className="underline break-all">
                  {link}
                </a>
              </p>
            )}
            <p className="mt-4 text-sm text-ink-3">
              The link opens your files. To unlock them on this device you&apos;ll then scan the code on a device that already has them, or enter your recovery code.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

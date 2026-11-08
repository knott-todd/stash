"use client";

import { useState } from "react";
import { Unlock } from "./Unlock";

// Sign in = scan a code from a device that has your files (or show one for it
// to scan). Email only matters when there's no other device: it finds the drive,
// and the recovery code opens it.
export function SignIn() {
  return <Unlock fallback={<EmailFallback />} />;
}

function EmailFallback() {
  const [open, setOpen] = useState(false);
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
    <div className="mt-6 text-sm">
      <button className="text-ink-3 hover:text-ink underline underline-offset-2" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide" : "No other device? Sign in with your email and recovery code"}
      </button>
      {open && state !== "sent" && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
          <p className="text-ink-2">We email a link that finds your drive on this device. Your recovery code then opens the files.</p>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-full border border-line bg-white px-5 py-3 text-base outline-none focus:border-ink"
            aria-label="Email"
            data-testid="signin-email"
          />
          <button type="submit" className="btn-primary py-3 text-base" disabled={state === "busy"} data-testid="signin-send">
            {state === "busy" ? "Sending" : "Send me a link"}
          </button>
          {error && <p className="text-accent-ink">{error}</p>}
        </form>
      )}
      {open && state === "sent" && (
        <div className="mt-3" role="status">
          <p className="text-ink-2">If Stash has a drive for that email, a link is on its way. Open it on this device, then enter your recovery code.</p>
          {link && (
            <p className="mt-2 text-ink-2">
              Email isn&apos;t set up here, so:{" "}
              <a href={link} className="underline break-all">
                {link}
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

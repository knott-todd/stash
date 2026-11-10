"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "./Logo";
import { forgetAccount, rememberedAccounts, type Remembered } from "@/lib/accounts";

// Sign in with Google. Accounts that have been used on this browser are listed
// first, like any account chooser; one tap goes straight to that account.
export function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/drive";
  const error = params.get("error");
  const [accounts, setAccounts] = useState<Remembered[] | null>(null);
  const [auth, setAuth] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((m) => {
        if (m.signedIn) return router.replace(next.startsWith("/") ? next : "/drive");
        setAuth(!!m.auth);
        setAccounts(rememberedAccounts());
      })
      .catch(() => setAuth(false));
  }, [router, next]);

  const go = (hint?: string) => {
    const q = new URLSearchParams({ next });
    if (hint) q.set("hint", hint);
    window.location.assign(`/api/auth/google?${q}`);
  };

  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-5xl px-5 py-5">
        <Logo />
      </header>
      <section className="mx-auto w-full max-w-md px-5 pb-16">
        <h1 className="text-3xl font-semibold">Sign in</h1>
        <p className="mt-2 text-ink-2">Your files follow your Google account. Sign in on any device and they are there.</p>

        {error && (
          <p className="mt-4 text-sm text-accent-ink" role="alert">
            {error === "denied" && "Google didn't sign you in. Try again."}
            {error === "expired" && "That took too long. Try again."}
            {error === "failed" && "Something went wrong signing in. Try again."}
          </p>
        )}

        {auth === false && <p className="mt-6 text-ink-2">Sign-in isn&apos;t set up on this server yet.</p>}

        {auth && accounts && accounts.length > 0 && (
          <ul className="mt-6 card divide-y divide-line overflow-hidden" aria-label="Accounts used on this device">
            {accounts.map((a) => (
              <li key={a.email} className="flex items-center gap-3 px-4 py-3">
                <button className="flex-1 flex items-center gap-3 text-left hover:underline underline-offset-4" onClick={() => go(a.email)} data-testid="account-pick">
                  <Avatar a={a} />
                  <span className="min-w-0">
                    {a.name && <span className="block font-semibold truncate">{a.name}</span>}
                    <span className="block text-sm text-ink-2 truncate">{a.email}</span>
                  </span>
                </button>
                <button
                  className="text-sm text-ink-3 hover:text-ink"
                  onClick={() => {
                    forgetAccount(a.email);
                    setAccounts(rememberedAccounts());
                  }}
                  aria-label={`Remove ${a.email} from this list`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {auth && (
          <button className="btn-primary mt-6 w-full py-3 text-base flex items-center justify-center gap-3" onClick={() => go()} data-testid="google-signin">
            <GoogleMark />
            {accounts && accounts.length > 0 ? "Use another account" : "Continue with Google"}
          </button>
        )}

        <p className="mt-6 text-sm text-ink-2 border-l-2 border-line pl-3">
          <span className="font-semibold text-ink">Stash is an early experiment.</span> We can&apos;t promise files will
          be kept forever, so keep another copy of anything you can&apos;t afford to lose.
        </p>

        <p className="mt-4 text-sm text-ink-3 text-center">
          By continuing you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-ink">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
            Privacy policy
          </Link>
          .
        </p>
      </section>
    </main>
  );
}

function Avatar({ a }: { a: Remembered }) {
  if (a.picture) return <img src={a.picture} alt="" width={36} height={36} className="size-9 rounded-full shrink-0" referrerPolicy="no-referrer" />;
  return (
    <span className="size-9 rounded-full bg-cream-2 text-ink flex items-center justify-center font-semibold shrink-0" aria-hidden>
      {(a.name ?? a.email).slice(0, 1).toUpperCase()}
    </span>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.5 2.9-2.2 5.4-4.7 7.1l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17z" />
      <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.6-5.9c-2.1 1.4-4.8 2.3-8 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

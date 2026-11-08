"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "./Logo";
import { AskPasscode, ProtectionChoice, type Protection } from "./Protection";
import { clearRawKey, getRawKey, recoveryCode, setRawKey, type WrappedKey } from "@/lib/crypto";
import { cacheClear } from "@/lib/filecache";
import { fmtBytes } from "@/lib/format";

type Me = { signedIn: boolean; email?: string | null; name?: string | null; picture?: string | null; protection?: Protection; key?: string | null; keyWrapped?: WrappedKey | null; fileCount?: number; bytes?: number };

export function Settings() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [askPasscode, setAskPasscode] = useState(false);

  const load = useCallback(async () => {
    const m: Me = await fetch("/api/me").then((r) => r.json());
    if (!m.signedIn) return router.replace("/signin?next=/settings");
    if (m.key) setRawKey(m.key);
    setMe(m);
    setHasKey(!!getRawKey());
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    clearRawKey();
    localStorage.removeItem("stash_gd_done_v1");
    await cacheClear();
    location.href = "/signin";
  }

  if (!me) return null;
  const raw = getRawKey();

  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-5xl px-5 py-5 flex items-center justify-between gap-4">
        <Logo />
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/drive" className="text-ink-2 hover:text-ink underline-offset-4 hover:underline">
            My drive
          </Link>
          <Link href="/devices" className="text-ink-2 hover:text-ink underline-offset-4 hover:underline">
            Devices
          </Link>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 pb-24 flex-1">
        <h1 className="text-3xl font-semibold">Settings</h1>

        <section className="mt-8" aria-labelledby="account">
          <h2 id="account" className="text-xl font-semibold">
            Account
          </h2>
          <div className="card mt-3 p-5 flex flex-wrap items-center gap-4">
            {me.picture && <img src={me.picture} alt="" width={44} height={44} className="size-11 rounded-full" referrerPolicy="no-referrer" />}
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{me.name ?? me.email}</p>
              <p className="text-sm text-ink-2 truncate">{me.email}</p>
              <p className="text-sm text-ink-3">
                {(me.fileCount ?? 0).toLocaleString()} files · {fmtBytes(me.bytes ?? 0)}
              </p>
            </div>
            <button className="btn-ghost border border-line" onClick={signOut} data-testid="settings-signout">
              Sign out
            </button>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="protection">
          <h2 id="protection" className="text-xl font-semibold">
            How your files are protected
          </h2>
          <p className="mt-1 text-ink-2 text-sm">Every file is encrypted before it is stored either way. The difference is who holds the key.</p>
          <div className="mt-4">
            {me.protection === "passcode" && !hasKey ? (
              <div className="card p-5">
                <p className="font-semibold">Your files are locked with a passcode.</p>
                <p className="mt-1 text-sm text-ink-2">Enter it to change this setting or see the recovery code.</p>
                <button className="btn-primary mt-3" onClick={() => setAskPasscode(true)}>
                  Enter passcode
                </button>
              </div>
            ) : (
              <ProtectionChoice
                current={me.protection ?? "standard"}
                onChanged={() => {
                  setShowRecovery(false);
                  load();
                }}
              />
            )}
          </div>
          {me.protection === "passcode" && hasKey && (
            <div className="mt-4 text-sm">
              <button className="text-ink-2 hover:text-ink underline underline-offset-4" onClick={() => setShowRecovery((s) => !s)}>
                {showRecovery ? "Hide recovery code" : "Show recovery code"}
              </button>
              {showRecovery && raw && (
                <code className="mt-2 block rounded-xl bg-cream-2 px-4 py-3 text-center text-lg tracking-wider font-mono select-all" data-testid="settings-recovery">
                  {recoveryCode(raw)}
                </code>
              )}
            </div>
          )}
        </section>
      </div>

      {askPasscode && (
        <AskPasscode
          wrapped={me.keyWrapped ?? null}
          onCancel={() => setAskPasscode(false)}
          onUnlocked={() => {
            setAskPasscode(false);
            setHasKey(true);
          }}
        />
      )}
    </main>
  );
}

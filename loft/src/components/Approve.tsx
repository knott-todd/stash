"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "./Logo";
import { getRawKey } from "@/lib/crypto";
import { sealKeyFor } from "@/lib/handshake";

export function Approve() {
  const params = useSearchParams();
  const id = params.get("r") ?? "";
  const askerPub = params.get("p") ?? "";
  const [state, setState] = useState<"ask" | "nokey" | "busy" | "done" | "error">("ask");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getRawKey()) setState("nokey");
  }, []);

  async function approve() {
    setState("busy");
    try {
      const sealed = await sealKeyFor(askerPub, getRawKey()!);
      const r = await fetch("/api/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "answer", id, ...sealed }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error ?? "That didn't work.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setError("That didn't work. Make a new code on the other device and try again.");
      setState("error");
    }
  }

  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-5xl px-5 py-5">
        <Logo />
      </header>
      <section className="mx-auto w-full max-w-md px-5 pb-16">
        {state === "nokey" && (
          <>
            <h1 className="text-3xl font-semibold">This phone can&apos;t approve</h1>
            <p className="mt-2 text-ink-2">It doesn&apos;t hold your key either. Scan the code with a device that already opens your files.</p>
            <Link href="/drive" className="btn-primary mt-6 inline-flex">
              Open my drive
            </Link>
          </>
        )}
        {(state === "ask" || state === "busy") && (
          <>
            <h1 className="text-3xl font-semibold">Open your files on the other device?</h1>
            <p className="mt-2 text-ink-2">It will be able to open everything in your drive, the same as this phone. Only do this for a device that is yours.</p>
            <div className="mt-6 flex gap-3">
              <button className="btn-primary" onClick={approve} disabled={state === "busy"} data-testid="approve-yes">
                {state === "busy" ? "Sending" : "Yes, open my files there"}
              </button>
              <Link href="/drive" className="btn-ghost">
                No
              </Link>
            </div>
          </>
        )}
        {state === "done" && (
          <>
            <h1 className="text-3xl font-semibold">Done</h1>
            <p className="mt-2 text-ink-2">The other device is opening your files now. You can close this.</p>
          </>
        )}
        {state === "error" && (
          <>
            <h1 className="text-3xl font-semibold">That didn&apos;t work</h1>
            <p className="mt-2 text-ink-2">{error}</p>
          </>
        )}
      </section>
    </main>
  );
}

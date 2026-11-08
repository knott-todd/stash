"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adoptKeyFromFragment, getRawKey } from "@/lib/crypto";

export function Claim() {
  const router = useRouter();
  const token = String(useParams().token ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Effects can run twice in dev; the first pass may already have adopted the key.
    const hadKey = adoptKeyFromFragment() || !!getRawKey();
    fetch(`/api/claim?t=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return setError(j.error ?? "This link didn't work.");
        // No key yet (sign-in link): go straight to the scanner.
        router.replace(hadKey ? "/drive" : "/unlock");
      })
      .catch(() => setError("Couldn't reach Stash. Check your connection and open the link again."));
  }, [token, router]);

  return (
    <main className="flex-1 flex items-center justify-center px-5">
      {error ? (
        <div className="card p-6 max-w-sm text-center">
          <p className="font-semibold">{error}</p>
          <a className="btn-primary mt-4 py-3 text-base" href="/drive">
            Open my drive
          </a>
        </div>
      ) : (
        <p className="text-ink-2" role="status">
          Opening your drive…
        </p>
      )}
    </main>
  );
}

"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { STAGING } from "@/lib/stage";
import { signOutEverywhereHere } from "@/lib/signout";

// The one header for every signed-in page. Every section is always there; the
// current one is bold. The usage figure sits at the far right of the links so
// it has nothing to push, and it slides in and out instead of popping.
export type Section = "drive" | "photos" | "devices" | "settings" | "phone";

const items: { id: Section; href: string; label: string }[] = [
  { id: "drive", href: "/drive", label: "My drive" },
  { id: "photos", href: "/drive?view=photos", label: "Photos" },
  { id: "devices", href: "/devices", label: "Devices" },
  { id: "settings", href: "/settings", label: "Settings" },
];

export function AppHeader({ active, usage, onBeforeSignOut }: { active: Section; usage?: string | null; onBeforeSignOut?: () => void }) {
  return (
    <header className="mx-auto w-full max-w-5xl px-5 py-5 flex items-center justify-between gap-4">
      <span className="flex items-center gap-3">
        <Logo />
        {STAGING && (
          <span className="rounded-full bg-cream-2 px-2.5 py-1 text-xs font-medium text-ink-2" title="This is the staging site">
            Staging
          </span>
        )}
      </span>
      <nav className="flex items-center gap-4 text-sm" aria-label="Sections">
        {items.map((it) => (
          <Link
            key={it.id}
            href={it.href}
            className={`whitespace-nowrap underline-offset-4 ${active === it.id ? "font-semibold text-ink" : "text-ink-2 hover:text-ink hover:underline"}`}
            aria-current={active === it.id ? "page" : undefined}
            data-testid={`nav-${it.id}`}
          >
            {it.label}
          </Link>
        ))}
        <span
          className="hidden md:grid overflow-hidden transition-[grid-template-columns,opacity] duration-200 ease-out text-ink-3 whitespace-nowrap"
          style={{ gridTemplateColumns: usage ? "1fr" : "0fr", opacity: usage ? 1 : 0 }}
          aria-hidden={!usage}
        >
          <span className="min-w-0 overflow-hidden" data-testid="usage">
            {usage ?? ""}
          </span>
        </span>
        <button
          className="text-ink-3 hover:text-ink underline-offset-4 hover:underline whitespace-nowrap"
          onClick={() => {
            onBeforeSignOut?.();
            signOutEverywhereHere();
          }}
          data-testid="sign-out"
        >
          Sign out
        </button>
      </nav>
    </header>
  );
}

import Link from "next/link";

// Wordmark only, to match the landing page.
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center text-xl font-semibold tracking-tight ${className}`} aria-label="Stash home">
      Stash
    </Link>
  );
}

import Link from "next/link";

export const metadata = { title: "Stash — Terms" };

export default function Terms() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 text-ink">
      <Link href="/" className="text-sm text-ink-2 hover:text-ink">
        ← Stash
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Terms</h1>
      <p className="mt-2 text-sm text-ink-3">Last updated 8 November 2026</p>

      <section className="mt-8 space-y-6 leading-relaxed text-ink-2">
        <p>Stash is free storage, offered as it is, while it is in early release.</p>
        <p>
          Your files are encrypted with a key that only your devices hold. If you lose every device and every link
          without your recovery code, nobody, including Stash, can recover your files.
        </p>
        <p>
          Don&apos;t store anything illegal, and don&apos;t use Stash to harm other people. Stash may remove content or
          drives that break this.
        </p>
        <p>
          Stash is run by one person and may change, pause or close. If it closes, you will get notice and time to
          export your files.
        </p>
        <p>Questions: olusanya.nkt.todd@gmail.com</p>
      </section>
    </main>
  );
}

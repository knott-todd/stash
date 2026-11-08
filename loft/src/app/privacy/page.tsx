import Link from "next/link";

export const metadata = { title: "Loft — Privacy" };

// Plain-language privacy policy. Google's OAuth verification requires one at a
// public URL; it also happens to be true, so it's written the way we'd say it.
export default function Privacy() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 text-ink">
      <Link href="/" className="text-sm text-ink-2 hover:text-ink">
        ← Loft
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Privacy</h1>
      <p className="mt-2 text-sm text-ink-3">Last updated 8 November 2026</p>

      <section className="mt-8 space-y-6 leading-relaxed">
        <div>
          <h2 className="text-xl font-semibold">What Loft stores</h2>
          <p className="mt-2 text-ink-2">
            Your files are encrypted on your device before they leave it, with a key that exists only on your devices.
            Loft and the storage providers it uses hold the encrypted form and cannot read your files. Loft keeps file
            names, sizes, folder names and dates so it can show you your drive.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Google Drive</h2>
          <p className="mt-2 text-ink-2">
            If you choose &ldquo;Move my Google Drive&rdquo;, Loft asks Google for read-only access to your Drive. It uses
            that access only to list your files and copy them into Loft, encrypted on your device as each one arrives.
            Loft never deletes, changes or shares anything in your Google Drive, and never uses Google data for
            advertising or for building profiles. You can remove Loft&apos;s access at any time at
            myaccount.google.com/permissions, or with &ldquo;Sign out&rdquo; in Loft, which discards the Google
            connection.
          </p>
          <p className="mt-2 text-ink-2">
            Loft&apos;s use of information received from Google APIs follows the Google API Services User Data Policy,
            including its Limited Use requirements.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Accounts and email</h2>
          <p className="mt-2 text-ink-2">
            Loft has no accounts and no passwords. Your drive is tied to your device. If you ask for a link to open your
            files on another device, Loft sends one email to the address you give and keeps that address so it can send
            you links again. Nothing else is sent.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">What Loft doesn&apos;t do</h2>
          <p className="mt-2 text-ink-2">
            No tracking, no analytics, no advertising, no selling or sharing of data. Loft keeps the minimum needed to
            show you your files and does nothing else with it.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Deleting your data</h2>
          <p className="mt-2 text-ink-2">
            Move a file to trash and Loft removes it from storage. To remove everything, email the address below and
            name the email you used for links; Loft deletes the drive and its files.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="mt-2 text-ink-2">olusanya.nkt.todd@gmail.com</p>
        </div>
      </section>
    </main>
  );
}

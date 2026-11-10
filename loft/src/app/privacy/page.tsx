import Link from "next/link";

export const metadata = { title: "Stash — Privacy" };

// Plain-language privacy policy. Google's OAuth verification requires one at a
// public URL; it also happens to be true, so it's written the way we'd say it.
// Keep it in step with the product: every feature that touches data is here.
export default function Privacy() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 text-ink">
      <Link href="/" className="text-sm text-ink-2 hover:text-ink">
        ← Stash
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Privacy</h1>
      <p className="mt-2 text-sm text-ink-3">Last updated 9 November 2026</p>

      <section className="mt-8 space-y-6 leading-relaxed">
        <div>
          <h2 className="text-xl font-semibold">Your files</h2>
          <p className="mt-2 text-ink-2">
            Every file is encrypted on your device before it is stored. The companies that hold the stored copies
            see only scrambled data under random names; they never see your file names, who you are, or what is
            inside. Stash keeps file names, sizes, folder names and dates so it can show you your drive, and a small
            encrypted preview of pictures and videos so it can show them in a grid.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Two ways to protect your files</h2>
          <p className="mt-2 text-ink-2">
            You choose one when you first sign in and can change it in Settings.
          </p>
          <p className="mt-2 text-ink-2">
            <span className="font-semibold text-ink">Standard.</span> Stash holds what is needed to open your files, so
            they open on any device the moment you sign in. In this mode Stash could technically open your files. We
            never do, except when you ask us to: a shared link, and nothing else. This is the same position Google
            Drive is in with your files today.
          </p>
          <p className="mt-2 text-ink-2">
            <span className="font-semibold text-ink">Locked with a passcode.</span> Only you can open your files. You
            choose a passcode that is never sent to Stash, and you type it once on each new device. Stash holds only
            a copy it cannot open. If you forget the passcode and lose the recovery code shown when you set it, your
            files cannot be opened by anyone, including us. Shared links are not available in this mode, because Stash
            cannot open the file for the person you share it with.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Your account</h2>
          <p className="mt-2 text-ink-2">
            You sign in with Google. Stash keeps your Google account&apos;s email address, name and picture so it can
            show who is signed in; it never sees your Google password. Signing out removes your files&apos; access from
            that browser. Stash uses no passwords of its own.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Moving files from another provider</h2>
          <p className="mt-2 text-ink-2">
            If you choose to move your files from Google Drive, Dropbox or OneDrive, Stash asks that provider for
            read-only access. It uses that access only to list your files and copy them into Stash, encrypted on your
            device as each one arrives. Stash never deletes, changes or shares anything at the other provider, and
            never uses that data for advertising or profiles. You can remove Stash&apos;s access at any time in that
            provider&apos;s account settings (for Google: myaccount.google.com/permissions) or from the move dialog in
            Stash.
          </p>
          <p className="mt-2 text-ink-2">
            Stash&apos;s use of information received from Google APIs follows the Google API Services User Data Policy,
            including its Limited Use requirements.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Linked computers and phones</h2>
          <p className="mt-2 text-ink-2">
            When you link a computer with Stash Desktop, it keeps a token on that computer so it can send files to your
            account without asking again, and it reads only the folders you tick. It reports to Stash which folders it
            watches, how many files they hold, and when it last sent one, so the Devices page can show you that your
            backup is running. Unlinking a device stops it at once; files it already sent stay in your account. On a
            Locked account, a linked computer keeps what it needs to open your files on that computer.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Sharing a file</h2>
          <p className="mt-2 text-ink-2">
            &ldquo;Get link&rdquo; makes a link that lets anyone who has it download that one file, with your name
            shown as the sender. Stash does not record who opens it. Removing the link stops it working immediately.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">What Stash doesn&apos;t do</h2>
          <p className="mt-2 text-ink-2">
            No tracking, no analytics, no advertising, no selling or sharing of data, and nothing of yours is used to
            train anything. Stash keeps the minimum needed to show you your files and does nothing else with it.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">If something goes wrong</h2>
          <p className="mt-2 text-ink-2">
            If your account information or files are ever exposed, Stash will email you at the address you sign in
            with, without undue delay, saying what happened, what was affected and what we are doing about it, and
            will tell the relevant authorities where the law requires it.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Taking your data with you, or deleting it</h2>
          <p className="mt-2 text-ink-2">
            Settings has &ldquo;Export everything&rdquo;: one zip of every file, readable, in its folders. Moving a file
            to trash removes it from storage. To delete your whole account, email the address below from the Google
            address you sign in with; Stash deletes the account, its catalogue and every stored file.
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

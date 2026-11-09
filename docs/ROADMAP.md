# Stash — feature tracker

Live at: https://github.com/knott-todd/stash/blob/main/docs/ROADMAP.md
Rule: nothing moves to **Complete** until it's verified on the production URL, not localhost.

Production: Vercel (serverless) + Neon Postgres (catalogue) + Vercel Blob (private staging) + Telegram (bytes). Cost today: $0.

## Complete (verified on https://stash.olusanyatodd.com, 2026-11-08)

| Feature | Notes |
| --- | --- |
| Sign in with Google | Accounts (decided 2026-11-08, evening). Session cookie; account chooser lists accounts used on this browser; real sign out. "Switch to Stash in 3 easy steps". |
| Client-side encryption | AES-GCM in the browser; the key belongs to the account and is handed to a browser after sign-in; storage holds ciphertext. |
| Add / open files | Viewable types open in a tab; others download. Local cache, "In cloud / On this device" badge. |
| Storage in Telegram (operator bot) | Users never see it. 20 MB per file in production (staged through a private Vercel Blob, deleted after transfer). |
| Google Drive migration | Real OAuth, folder paths, Docs/Sheets exported, resumable, stop/resume, smallest-first, status line. |
| File browser | Sort, select, keyboard, right-click / ⋮ menu, rename, trash + undo, search, folder in URL, phone layout. |
| Open on another device | Sign in with the same Google account there. QR carries only the sign-in address. |
| Switch Google account | "Use a different Google account" in the migration dialog; header "Sign out" ends the session and clears the key and local copies. |
| Demo controls | `?demo=1` sticks per tab: Start fresh, simulated camera roll on `/m`. |
| Sign in from a new device | Google sign-in; files appear. A pre-account device drive is folded into the account on first sign-in if the account is empty. |
| Phone photo backup | Real photo picker + encrypted upload (built in the parallel session). |
| Files of any size | Overnight 2026-11-09. Encrypted in fixed 4,000,000-byte pieces, one request per piece; download concatenates. Vercel Blob staging removed. |
| Linked devices | Six-letter code approved in the browser, device tokens, Devices page with per-device folders, counts, state, last seen, rename, unlink. |
| Stash Desktop | An installable app (Electron, `desktop/app`): one button to link, Documents and Pictures ticked by default, status per folder, tray icon, starts at sign-in. Windows installer built (`desktop/dist/Stash-Setup.exe`, unsigned); Mac build needs a Mac. Verified by driving the real app. Staging only until the installer is published and signed. The CLI stays for development. |
| Standard vs Locked | First-run choice and Settings: Stash holds the key (Standard) or only a passcode-wrapped copy (Locked, PBKDF2 600k + AES-GCM), recovery code shown at lock time and in Settings. Desktop agent and phone app ask for the passcode once. |
| Two-step setup | Move my files here (Google Drive; Dropbox and OneDrive when keys are set) and Back up automatically (this computer, my phone). Big on an empty drive, a strip with ticks afterwards. |
| Photos view | Every picture and video by month, newest first, file's own date when known. |
| Grid view and previews | Encrypted previews made in the browser at upload (and by the desktop agent with sharp); older files get one on first sight in a grid. |
| Drive features | Multi-select (Ctrl/Cmd, Shift, Ctrl+A), selection bar, drag rows onto folders or crumbs, Move dialog, New folder (empty folders remembered), batch move. |
| Shared links | Public per-file link, decrypted server-side (Standard accounts only), plain download page with inline image/video/PDF, removable. |
| Export everything | Settings: one zip of every file, decrypted, in its folders; streams to disk on Chrome/Edge. |
| Dropbox and OneDrive moves | Same browser-side copy as Google Drive; offered when `DROPBOX_APP_KEY/SECRET` or `MS_CLIENT_ID/SECRET` are set. Not yet run against real apps. |
| Phone app scaffold | `mobile/` (Expo): link, allow photos, background backup, passcode screen. Untested; needs a device build. |

## In the works

| Feature | Status | Owner |
| --- | --- | --- |
| Google OAuth verification (Drive scope) | not pursued (CASA assessment ~$500+/yr); Drive import stays in Testing mode with named test users | — |


## Proposed (not started, in rough priority)

-1. **Storage resilience.** The store rests on a Telegram-side behaviour that could close at any time, so Stash must never be the only copy. Two pieces: a full export that runs from any device (web, desktop, phone) with no per-file clicking, and a second storage backend behind the same file API so a closed door becomes a migration, not a loss. Until both exist, no copy or feature nudges people to delete or cancel the copy they already have.
0. **New-user onboarding as a short checklist** on the empty drive: 1. Move from your current provider (Google Drive now; Dropbox/iCloud later), 2. Set up automatic backup (phone photos; WhatsApp on Android), 3. Open on your other devices. Each step one tap, ticks off when done, disappears when all three are done. Replaces the three tiles.
1. **Staging via Cloudflare R2** (needs an R2 bucket + token from Olusanya) while Blob is paused; small files already bypass staging.
2. ~~Storage in the user's own Telegram~~ **Out** (Olusanya, 2026-11-08 night): never decided, and it would mean asking people to open a Telegram account, which the product never mentions. Storage stays operator-side.
3. ~~Files over 20 MB via chunking~~ → built 2026-11-09 (see Complete).
4. ~~Journeys 2–7 specified in full~~ → docs/JOURNEYS.md.
5. Native mobile app: journey 1 only (photo auto-backup, keychain-stored key, background transfer). **Android APK builds (2026-11-08, `exports/android/Stash-0.1.0.apk`); not yet run on a phone.** iOS needs the Apple developer account.
6. Export everything (zip of decrypted files).
7. ~~Passkeys or PIN escrow for lost-everything recovery~~ → moot with accounts; an opt-in "lock with a passcode" is the only remaining form.
8. Desktop sync folder; Gmail attachment button; Android WhatsApp import.
9. ~~Local Bot API server (~$5/mo)~~ **Out**: no paid infrastructure for this app (Olusanya, 2026-11-08 night). Chunking covers large files.
10. Drag-to-move, multi-select, New folder, grid view; Dropbox; shared links.
 11. **Storage management** (Olusanya, 2026-11-08): a treemap of the account, exact duplicates by content hash (one-tap, provably safe), unused files (never opened, by catalogue fact), near-duplicate photos by on-device perceptual hash shown for a decision. Guarantee: nothing one-tap unless byte- or metadata-identical by construction; no model in the loop. See docs/DESIGN-REVIEW-2026-11-08.md section 4.
 12. **Private album and locking** (Olusanya, 2026-11-08): a hidden album whose files leave My drive, Photos, search and the Devices counts, and are only listed after a passcode (or biometrics on the phone app) is entered in that session. Locking: individual files or folders can be locked the same way, including on a Standard account, where the lock wraps those files' keys with the passcode client-side so Stash cannot open them either. Needs: a per-session unlock, hidden files kept out of shared links and export by default, and clear copy about what a forgotten passcode means for just those files.

Olusanya's order (2026-11-08 night): 5, 8, 6, 10, 0, 7. The thread through them: migrate from any provider → automatic backup of a computer's folders → connect the phone for automatic photo backup → a drive people trust because they can see it is automatic (Devices page) → then speed. Rich search (text in scans, objects and people in photos, Google Photos style) only if it can be genuinely good for free; otherwise not mentioned at all.

## Ideas (not prioritised, 2026-11-08)

Each one states the user's problem first. Marked (frontier) when it depends on something phones only recently became able to do; the rest are ordinary engineering that nobody has shipped for this audience.

| Idea | The problem | How it would work | Needs |
| --- | --- | --- | --- |
| Stop the warning | "Storage almost full" never goes away, even after moving to Stash. | After a file is verified in Stash (downloaded back and checksum matches), offer to delete the original. Trust is the hard part: show the proof before the delete button. On-device dedupe spots the same photo twice. | Verify-then-delete flow; dedupe (frontier, on-device). |
| Mum's phone | Helping a parent means borrowing their phone. | Let another person's device open a shared part of your drive, with its own key, revocable from yours. | Permissions model on per-folder keys. |
| Where did it go | Saving from WhatsApp, Mail or Safari goes to "Files" and gets lost. | Stash in the share sheet, filed by source app and date. | Share-sheet extension (already in the roadmap under native app). |
| Inheritance | Photos die with the phone. | Name a person who can open the drive after a waiting period you set; the key releases to them without Stash ever holding it. | Zero-knowledge timed release, same mechanics as recovery escrow (borrows from frontier recovery patterns). |
| Documents (frontier) | Scans of passports, bills and letters are unsearchable. | Read the text on the device at upload time; search by "passport" or "electricity bill" with nothing leaving the phone. | On-device text recognition and small vision models. |
| Family drive | One household, four phones, one set of photos. | A shared folder whose key each member's device holds; leaving a member re-keys it. | Per-folder key sharing. |
| "What we can't do" page | People assume the catch. | A public page listing the limits honestly (file size, no Google verification, recovery rules). | A web page. |

Also from the frontier list, not yet turned into product ideas: on-device search across all files, passkey recovery, local-first sync.

## Known limits (say them out loud)

- Stash Desktop's installer is unsigned: Windows SmartScreen shows "Windows protected your PC" until a code-signing certificate (about /month via Azure Trusted Signing) or Microsoft Store distribution; macOS needs an Apple developer account for notarization. The installer must also be published as a GitHub Release for the download button to work.
- Production shows "This computer (soon)"; the desktop setup lives on staging until the above is done.
- The phone app is a scaffold nobody has run; automatic phone backup still means opening the web page and picking photos.
- Dropbox and OneDrive need app registrations (keys in `.env.example`) and a first real run.
- Shared links and the server-side preview on the link page work only for Standard accounts; Locked accounts get a clear refusal.
- Google sign-in is limited to the consent screen's test users until the app is published in Google Cloud Console (a button, no verification, for sign-in scopes).
- Telegram rate limits still apply: a very large first backup from Stash Desktop will see "storage is busy" pauses and carry on.

- Telegram Bot API: 20 MB per download via `getFile`; production uploads are capped at 20 MB to match (local dev allows 50).
- Google Drive listing of a very large Drive takes 1–2 minutes; cached for an hour.
- Demo-mode migration rows (when Google isn't configured) are placeholders with no bytes.
- Vercel functions cap request bodies at 4.5 MB. Files ≤ 4 MB go direct; larger ones are staged through Vercel Blob, whose free tier meters 2,000 operations/month (three per file) and **is paused until ~2026-12-08** after the hackathon copies. Next: stage through Cloudflare R2 (1M ops/month free), then no staging at all once storage is the user's own Telegram.
- Telegram rate-limits the bot as a whole (seen: "retry after 434 s"); the app now says "Storage is busy, try again in N minutes" instead of failing. Another reason for per-user Telegram storage.

## Decisions log

- 2026-11-08 (night): **copy, never delete.** Stash never nudges people to cancel Google One, delete their Google Drive, or free phone originals. Reason: the data store depends on an exploit that could be patched at any moment, so Stash cannot yet be anyone's only copy. Removed the "Cancel Google One" link (web and phone); "Free up space" shelved; storage resilience added at the top of Proposed.
- 2026-11-08 (evening): **accounts.** Sign in with Google; Stash holds each account's file key (Google Drive's position: encrypted in storage, readable by the service when the user asks). Reason: a device-held key made sign out unsafe and sign in meaningless, and recovery codes were too much to ask. QR unlock, email links and recovery codes removed. End-to-end "lock with a passcode" can return as an opt-in. Google consent screen must be published (non-sensitive scopes, no verification) before people outside the test-user list can sign in.
- 2026-11-07: device-first identity, no accounts. Client-side encryption (option A). Email link carries the key; server never stores it.
- 2026-11-07: supplier (Telegram) never named in the product.
- 2026-11-08: "Sign out" means sign out of Google; the device keeps the key.
- 2026-11-08: production on Vercel + Neon + private Blob staging; store moved behind an interface (JSON locally, Postgres in production). Product renamed Stash.
- 2026-11-08: Google verification not pursued. Direction: drop-in replacement for Drive's integrations, native app for photo auto-backup. Large files by browser-side chunking; local Bot API server deferred.
- 2026-11-08: storage moves to each user's own Telegram (free/unlimited holds; bytes never touch our servers). Sign-in = email names the drive; the key still arrives device-to-device, keychain, or recovery code; PIN-wrapped key in the user's own Saved Messages considered for later.
- 2026-11-08 (late): sign-in from a new device shipped. Vercel Blob free quota exhausted by hackathon-scale copies; small files go direct, R2 staging next.

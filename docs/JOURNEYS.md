# Stash journeys — end state first, every step counted

Rules: the end state is what the user can see and rely on, not the last tap. Every step is listed, including OS
prompts, waits and things that must silently be true. "Forced by" says who imposes the step: **us** (we can
remove it), **OS** (Apple/Google impose it; we can only make it land once), **user** (it's their own act),
**physics** (bytes take time). Trim comes after the full list, never instead of it.

Journey 1 (phone photos) is in DESIGN.md. Shared assumptions below: the native app exists, the key lives in the
OS keychain, files of any size work (chunking).

---

## Journey 2 — Anything from any app ends up in Stash

**Start:** user is in another app (Photos, Safari, a PDF viewer, a chat) looking at a thing they want to keep.
**End:** that thing is in Stash, named recognisably, findable later without remembering where it came from, and
the user had a moment of confirmation strong enough that they can close the other app and forget about it.

| # | Step | Forced by |
| --- | --- | --- |
| 1 | Stash is installed on this device (otherwise the share sheet never lists it) | us (one-time) |
| 2 | Tap Share in the other app | OS |
| 3 | Find Stash in the share sheet. First time it is buried at the end of the row; the user scrolls or taps "More" and may pin it | OS |
| 4 | Tap Stash | user |
| 5 | (Drive here: account picker → folder picker → rename field → Save button) | removed by us |
| 6 | Stash's share extension opens briefly, shows the item, starts the upload | us |
| 7 | Upload. A photo: 1–3 s on Wi-Fi. A 200 MB video: minutes. The share extension on iOS is killed by the OS after a short time, so anything not finished in seconds must be handed to the main app's background transfer | OS + physics |
| 8 | Confirmation: "Saved to Stash" with the name, and a *Rename* / *Move* affordance for the one case where "image.jpg" isn't enough. The sheet closes on its own | us |
| 9 | Later: the user opens Stash and finds it. Without a chosen folder, where is it? Default: a **Shared** folder, newest first, with the source app and date as the second line ("from Safari · today") | us |
| 10 | Trust: if the upload failed (offline, phone locked), the user must learn it *without reopening the other app*: a quiet badge on Stash's icon and a "1 waiting to upload" line at the top of the drive, which retries by itself | us |

**Trim:** 5 is gone. 3 is a one-time OS cost; we can shorten it by offering "Pin Stash to your share sheet" once,
in-app, with a picture, rather than letting people find it. 7 is engineering (background transfer), not a step.
8 and 9 are the decisions that make 2 taps feel like enough: no folder question because *Shared* with a source
line is better than a picker nobody wants.

**User taps after setup: 2** (Share, Stash). Nothing to confirm.

**Depends on:** native app with a share extension and background transfer; the *Shared* folder convention;
source-app metadata on the file row.

---

## Journey 3 — Stash is a place in the phone's file system

**Start:** user is in Mail / Notes / a game / anything with "Save to…" or "Open from…".
**End:** Stash appears alongside iCloud Drive / Google Drive in iPhone *Files* and Android's picker; the user can
save into it, open from it, and browse it there, and what they see there is the same drive as in the app.

| # | Step | Forced by |
| --- | --- | --- |
| 1 | Stash installed | us (one-time) |
| 2 | The app registers as a file provider at first launch. On iOS this is automatic once the extension exists; on Android the DocumentsProvider is declared in the manifest. The user does nothing | us |
| 3 | In *Files*, Stash shows under *Locations*. Note: on iOS it is **hidden** until the user enables it under Browse → Edit (toggle). That is an OS step we cannot remove, only explain | OS |
| 4 | User taps Stash in Files, sees folders and files | OS |
| 5 | Opening a file from there: the provider fetches and decrypts on demand. Files that aren't on the device show a cloud icon and download when tapped; a 2 GB video takes as long as it takes | physics |
| 6 | Saving into it from another app: the OS hands us the bytes; we encrypt and upload in the background exactly as the share sheet does | us |
| 7 | Consistency: a rename or move done in *Files* must show in the app within seconds and vice versa, or the user stops trusting one of them | us |
| 8 | Offline: browsing the list must work with no network (we cache the catalogue); opening an un-downloaded file must fail with "not on this device" rather than spin | us |

**Trim:** nothing for the user to do beyond 3, which is Apple's toggle. Everything else is us keeping two views
of one drive honest.

**User taps after setup: 0**, plus Apple's one-time toggle on iOS.

**Depends on:** native app with File Provider (iOS) / DocumentsProvider (Android); the catalogue cached
on-device; on-demand decrypt streaming.

---

## Journey 4 — WhatsApp backups land in Stash (Android only)

**Start:** Android user with WhatsApp, which currently backs up to Google Drive.
**End:** WhatsApp's media (photos, videos, voice notes, documents) and its chat-history backup files are in Stash
and stay current; the user could cancel Google storage and still restore WhatsApp from Stash.

Honesty first: WhatsApp's backup targets are hard-wired (Google Drive on Android, iCloud on iPhone). No third
party can be chosen inside WhatsApp. What *is* possible on Android: WhatsApp keeps its media and its encrypted
chat backups in a folder on the phone (`Android/media/com.whatsapp/WhatsApp/`), and an app with folder access
can copy it. On iPhone that folder is sealed; nothing can be done, and the app says so in one sentence.

| # | Step | Forced by |
| --- | --- | --- |
| 1 | Stash installed (Android) | us |
| 2 | In Stash: tap "Back up WhatsApp" | user |
| 3 | Android's folder-access prompt for the WhatsApp folder (Storage Access Framework): the user has to navigate to the folder and tap "Use this folder". Android 11+ makes this clumsy on purpose. We pre-open the right folder when the OS allows and show a picture of what to tap | OS |
| 4 | First copy: WhatsApp media is often 5–30 GB. Hours on home Wi-Fi. Progress line, survives app close, Wi-Fi-and-charging by default for the first run | physics |
| 5 | Ongoing: new media appears in that folder as chats arrive; Stash watches the folder (WorkManager job on a schedule, or a file-observer while the app lives) and uploads new items | us |
| 6 | The chat *history* backup (`msgstore.db.crypt15`) is produced by WhatsApp on its own schedule, encrypted with WhatsApp's key. We copy the latest one; restoring it later is done in WhatsApp from a local file, which WhatsApp supports ("Restore from local backup") if the file is put back in place | WhatsApp |
| 7 | Restore path must be documented in-app in three lines, because "it's backed up" is worthless if nobody knows how to put it back | us |
| 8 | Trust line: "WhatsApp: 12,480 items safe · last change 3 min ago" | us |

**Trim:** 3 is the only user-facing friction and Android owns it. Everything else is one tap and then watching.
We do not add a "which chats" or "media types" screen.

**User taps after install: 2** (Back up WhatsApp, Use this folder). Then 0.

**Depends on:** native Android app with SAF folder persistence and a background job; chunking (videos).
iPhone: not possible; one honest sentence instead of a button.

---

## Journey 5 — A folder on the computer that *is* Stash

**Start:** laptop user with files in Downloads / Desktop they want kept safe and available on their phone.
**End:** a "Stash" folder exists on the computer; anything placed in it is in Stash within seconds and visible on
the phone; anything added from the phone appears in the folder; the user never thinks about syncing.

| # | Step | Forced by |
| --- | --- | --- |
| 1 | Download the desktop app from stash.olusanyatodd.com (Mac/Windows). On Mac, Gatekeeper's "unidentified developer" wall unless we pay Apple $99/yr for notarisation; on Windows, SmartScreen's "unrecognised app" unless we buy a code-signing certificate. Both are real steps for the user until paid | OS (money) |
| 2 | Open it. It needs to know which drive is yours and must get the key: scan the QR shown on the laptop with the phone (1 scan), or paste the email link | us |
| 3 | It creates `~/Stash` and shows it in Finder/Explorer sidebar | us |
| 4 | First sync: downloads the catalogue, then files **on demand** by default (placeholders that fill when opened), so a 50 GB drive doesn't eat the laptop. Drive and iCloud both do this; it's the right default | us |
| 5 | User drags a file in. Watcher sees it, encrypts, uploads in pieces, shows a small ✓ overlay. If the laptop lid closes mid-upload it resumes on wake | us |
| 6 | Conflicts: edited on two devices before sync. We don't merge; we keep both ("report (laptop copy)") and say so once | us |
| 7 | Trust: a menu-bar/tray icon with one line ("All up to date" / "Uploading 3") and a way to pause | us |

**Trim:** 1's warnings go away only with money (notarisation/signing), the same money problem as Google. Until
then the download page shows the exact two clicks to get past the wall. 2 is one scan.

**User steps: download, open, scan** (3). Then 0.

**Depends on:** a desktop app (Tauri), chunked uploads, placeholder/on-demand files; signing budget later.

---

## Journey 6 — A Gmail attachment goes to Stash

**Start:** reading an email in Gmail on the web with an attachment.
**End:** the attachment is in Stash, and the user did not download it to the laptop first.

| # | Step | Forced by |
| --- | --- | --- |
| 1 | Install the Stash browser extension (Chrome Web Store; Safari needs a paid Apple account, so Chrome/Edge/Firefox first) | us (one-time) |
| 2 | The extension must know which drive is yours: it opens stash.olusanyatodd.com, which already has the cookie and key if this browser has used Stash; otherwise the email-link / QR step once | us |
| 3 | In Gmail, hover an attachment: Gmail shows its own "Add to Drive" icon; our extension adds a Stash icon beside it | us |
| 4 | Click it. The extension downloads the attachment in the background, encrypts, uploads | us |
| 5 | Confirmation: the icon turns into a ✓; a tooltip "In Stash · Shared" | us |
| 6 | Gmail changes its DOM without notice; the extension must fail visibly ("Stash couldn't find the attachment, update the extension") rather than silently vanish | us |

**Trim:** matches Drive's own one-click; nothing to beat, only not to lose.

**User clicks after setup: 1.**

**Depends on:** a small browser extension; the web app's existing upload path.

---

## Journey 7 — A new or second device has my drive

**Start:** (a) new phone of the same kind restored from backup; (b) new phone of the other kind, or a second
device; (c) everything lost.
**End:** the device shows the same drive, can open files, and photo backup (journey 1) continues on it without
duplicating or starting over.

| Case | Steps | Forced by |
| --- | --- | --- |
| (a) same kind, restored from Apple/Google backup | Install Stash (or it came with the restore). Open. The keychain restore brought the drive id and key. Files are there. Photo backup resumes from the last uploaded photo because the "already backed up" ledger is on the server, not the phone. **0 steps beyond opening the app.** | — |
| (b) other kind, or second device | Open Stash on the new device. It shows "Is this a new device? Scan this from your other phone, or get a link by email." Scan from the old device (1), or type email + tap the link that arrives (2). | us |
| (c) everything lost, no backup | Email the link to yourself (needs the email to have been given before) → the link carries the key? **No**: links are minted on a device that has the key. With no device, the only key source is the recovery code. Type it (26 chars). | us |

**The uncomfortable truth in (c):** if someone never gave an email *and* never noted the recovery code, the files
are gone. That is the price of "Stash can't read your files" and every zero-knowledge product has it. What we can
do: ask for an email after the first file (done), show the recovery code once more at a calm moment (after
the first backup completes), and later add PIN escrow so (c) becomes "type your 6-digit PIN".

**Depends on:** native app + keychain; server-side backup ledger (so backups resume by content hash, not by
device); the existing link/QR/code flows.

---

## Cross-cutting requirements that these journeys share

1. **Background transfer** on iOS and Android that survives the app being closed; it underlies journeys 1, 2, 3, 4.
2. **Chunked files** (decided): nothing above breaks on a video.
3. **A server-side "already backed up" ledger keyed by content hash**, so any device can resume any backup without duplicates (journeys 1, 4, 7).
4. **On-device catalogue cache** so browsing works offline (3, 5).
5. **One status line per feature**, truthful, with the time of the last successful item; no notifications except for a failure the user must act on.
6. **Money-gated polish**, listed so it isn't forgotten: Apple developer account ($99/yr: App Store, Safari extension, Mac notarisation), Google Play ($25 once), Windows code signing. None block building; all affect first-run friction.

## Build order this implies

1. Chunking (web, now).
2. Native app, journey 1 only, with the keychain key and the server ledger; TestFlight/APK to you and the organisers.
3. Share extension (journey 2) and Files provider (journey 3) in the same app.
4. Android WhatsApp import (journey 4).
5. Desktop folder (journey 5), then the Gmail extension (journey 6).

# Google OAuth verification pack — Stash

Scope requested: `https://www.googleapis.com/auth/drive.readonly` (restricted). Everything Google asks for in the
verification form, ready to paste. Submit from Google Cloud Console → APIs & Services → OAuth consent screen →
**Publish app** → **Prepare for verification**.

## App details

| Field | Value |
| --- | --- |
| App name | Stash |
| Homepage | https://stash.olusanyatodd.com |
| Privacy policy | https://stash.olusanyatodd.com/privacy |
| Terms of service | https://stash.olusanyatodd.com/terms |
| Authorised domain | olusanyatodd.com |
| Support / developer email | olusanya.nkt.todd@gmail.com |
| Scopes | `drive.readonly` only |

## How Stash uses the Drive scope (paste into "Scope justification")

Stash is a free, encrypted file drive. Its "Move my Google Drive" feature copies a user's files out of Google Drive
into Stash so they can stop paying for Google storage. To do that, Stash needs to (1) list every file and folder in
the user's Drive, with folder structure, and (2) download each file's contents once. Google Docs, Sheets and
Slides are exported (PDF / XLSX) because they have no native bytes.

`drive.readonly` is the narrowest scope that allows listing and downloading all of a user's existing files.
`drive.file` would only expose files the user picks one at a time or that Stash created, which defeats a
whole-Drive migration. Stash never writes to, modifies, shares or deletes anything in Google Drive.

Each file is encrypted in the user's browser as it is downloaded, with a key that exists only on the user's
device, before being stored. Stash's servers never see or store file contents in readable form, and Google data is
not used for any purpose other than the copy the user explicitly started.

## Limited Use statement (paste into the form)

Stash's use and transfer to any other app of information received from Google APIs will adhere to the
Google API Services User Data Policy, including the Limited Use requirements. Specifically: Google user data is
used only to provide the user-facing file-migration feature; it is never used for advertising, never sold, never
transferred to third parties except as needed to provide the feature (encrypted storage), and never read by humans
except with the user's explicit consent or for security purposes.

## Data handling answers

- **Does the app store Google user data?** File names, sizes, folder paths and dates are stored so the user can
  see their drive. File contents are stored only in encrypted form produced on the user's device.
- **Where?** Catalogue: Neon (Postgres, US). Encrypted bytes: Telegram cloud storage, via a bot the developer
  operates. Transient staging: Vercel Blob (private, deleted within seconds).
- **Retention:** until the user deletes the file or asks for the drive to be removed (privacy page).
- **Access tokens:** stored server-side per device, used only while a copy runs; removed by "Sign out" or
  "Use a different Google account".
- **Who can access?** Only the user, from a device holding their key. The developer cannot decrypt contents.

## Demo video (you record, ~2 minutes, unlisted YouTube link)

Google wants to see the OAuth flow and how the scope is used. Script:

1. Open https://stash.olusanyatodd.com. Say: "Stash is an encrypted file drive. This shows the Google Drive import."
2. Click *Switch to Stash in 3 easy steps*. Show the empty drive.
3. Click *Move my Google Drive* → *Allow*. Show Google's account chooser and the consent screen with the Drive
   read-only permission. Approve.
4. Back in Stash, show "Reading your Google Drive", then files appearing with their folders. Say: "Each file is
   downloaded once and encrypted in the browser before it is stored. Nothing in Google Drive is changed."
5. Open one copied file to show it is intact.
6. Click *Sign out* and say: "This removes Stash's Google access token." Optionally show
   myaccount.google.com/permissions with Stash removable.
7. Show the privacy page URL in the address bar.

Record in a clean browser profile so the account chooser appears. The app must be in **Production** (not Testing)
mode at submission; keep testers listed meanwhile.

## What to expect

- Google replies in days to a few weeks with questions or approval. Restricted scopes (`drive.readonly`) also
  require a **CASA Tier 2 security assessment** from an approved assessor before full approval; Google will send
  the list. Until then the "unverified app" interstitial appears and usage is capped at 100 users.
- If the assessment cost is a problem, the fallback is `drive.file` with Google's file picker (user selects
  folders to import). Less seamless, no assessment.

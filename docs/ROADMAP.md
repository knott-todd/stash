# Stash — feature tracker

Live at: https://github.com/knott-todd/stash/blob/main/docs/ROADMAP.md
Rule: nothing moves to **Complete** until it's verified on the production URL, not localhost.

Production: Vercel (serverless) + Neon Postgres (catalogue) + Vercel Blob (private staging) + Telegram (bytes). Cost today: $0.

## Complete (verified on https://stash.olusanyatodd.com, 2026-11-08)

| Feature | Notes |
| --- | --- |
| Landing → drive with no account | Device identity (cookie). "Switch to Stash in 3 easy steps". |
| Client-side encryption | AES-GCM in the browser; key only on the device; server holds ciphertext. |
| Add / open files | Viewable types open in a tab; others download. Local cache, "In cloud / On this device" badge. |
| Storage in Telegram (operator bot) | Users never see it. 20 MB per file in production (staged through a private Vercel Blob, deleted after transfer). |
| Google Drive migration | Real OAuth, folder paths, Docs/Sheets exported, resumable, stop/resume, smallest-first, status line. |
| File browser | Sort, select, keyboard, right-click / ⋮ menu, rename, trash + undo, search, folder in URL, phone layout. |
| Open on another device | Email link (key in link, single-use, 24 h) via SMTP; QR for phones. Recovery code as last resort. |
| Switch Google account | "Use a different Google account" + header "Sign out" (Google only). |
| Demo controls | `?demo=1` sticks per tab: Start fresh, simulated camera roll on `/m`. |
| Sign in from a new device | `/signin`: email → identity-only link → `/unlock`. Phone: in-page camera scans the code on a device that has the key. Laptop: shows a code; the phone scans it with its camera app and approves; the key travels sealed to a one-time keypair (ECDH + AES-GCM) through a relay that can't open it. Recovery code as last resort. A device holding files without the key never mints a new one. |
| Phone photo backup | Real photo picker + encrypted upload (built in the parallel session). |

## In the works

| Feature | Status | Owner |
| --- | --- | --- |
| Google OAuth verification (Drive scope) | not pursued (CASA assessment ~$500+/yr); Drive import stays in Testing mode with named test users | — |


## Proposed (not started, in rough priority)

1. **Staging via Cloudflare R2** (needs an R2 bucket + token from Olusanya) while Blob is paused; small files already bypass staging.
2. **Storage in the user's own Telegram** (MTProto as the user, bytes phone↔Telegram directly): keeps "free, unlimited" true at scale and our running cost at ~$0. Decided 2026-11-08; native app is built on it; web can follow.
3. Files over 20 MB via chunking (written against the own-Telegram adapter).
2. ~~Journeys 2–7 specified in full~~ → docs/JOURNEYS.md.
3. Native mobile app: journey 1 only (photo auto-backup, keychain-stored key, background transfer).
4. Export everything (zip of decrypted files).
5. Passkeys or PIN escrow for lost-everything recovery.
6. Desktop sync folder; Gmail attachment button; Android WhatsApp import.
7. Local Bot API server when there's budget (~$5/mo): 2 GB files without pieces.
8. Drag-to-move, multi-select, New folder, grid view; transactional email; Dropbox; shared links.

## Known limits (say them out loud)

- Telegram Bot API: 20 MB per download via `getFile`; production uploads are capped at 20 MB to match (local dev allows 50).
- Google Drive listing of a very large Drive takes 1–2 minutes; cached for an hour.
- Demo-mode migration rows (when Google isn't configured) are placeholders with no bytes.
- Vercel functions cap request bodies at 4.5 MB. Files ≤ 4 MB go direct; larger ones are staged through Vercel Blob, whose free tier meters 2,000 operations/month (three per file) and **is paused until ~2026-12-08** after the hackathon copies. Next: stage through Cloudflare R2 (1M ops/month free), then no staging at all once storage is the user's own Telegram.
- Telegram rate-limits the bot as a whole (seen: "retry after 434 s"); the app now says "Storage is busy, try again in N minutes" instead of failing. Another reason for per-user Telegram storage.

## Decisions log

- 2026-11-07: device-first identity, no accounts. Client-side encryption (option A). Email link carries the key; server never stores it.
- 2026-11-07: supplier (Telegram) never named in the product.
- 2026-11-08: "Sign out" means sign out of Google; the device keeps the key.
- 2026-11-08: production on Vercel + Neon + private Blob staging; store moved behind an interface (JSON locally, Postgres in production). Product renamed Stash.
- 2026-11-08: Google verification not pursued. Direction: drop-in replacement for Drive's integrations, native app for photo auto-backup. Large files by browser-side chunking; local Bot API server deferred.
- 2026-11-08: storage moves to each user's own Telegram (free/unlimited holds; bytes never touch our servers). Sign-in = email names the drive; the key still arrives device-to-device, keychain, or recovery code; PIN-wrapped key in the user's own Saved Messages considered for later.
- 2026-11-08 (late): sign-in from a new device shipped. Vercel Blob free quota exhausted by hackathon-scale copies; small files go direct, R2 staging next.

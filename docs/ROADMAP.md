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
| Phone photo backup | Real photo picker + encrypted upload (built in the parallel session). |

## In the works

| Feature | Status | Owner |
| --- | --- | --- |
| Google OAuth verification (Drive scope) | consent-screen links + verification pack next | Olusanya + Claude |


## Proposed (not started, in rough priority)

1. Export everything (zip of decrypted files) — the honest "your files are yours".
2. Files over 50 MB (Telegram local Bot API server, or chunking).
3. Passkeys (Face ID / Touch ID) so email links can be zero-knowledge again.
4. Automatic phone backup (PWA / native) instead of pick-and-upload.
5. Drag-to-move, multi-select, New folder, grid view for photos.
6. Transactional email provider instead of Gmail SMTP.
7. Dropbox migration.
8. Shared links.

## Known limits (say them out loud)

- Telegram Bot API: 20 MB per download via `getFile`; production uploads are capped at 20 MB to match (local dev allows 50).
- Google Drive listing of a very large Drive takes 1–2 minutes; cached for an hour.
- Demo-mode migration rows (when Google isn't configured) are placeholders with no bytes.
- Vercel functions cap request bodies at 4.5 MB; uploads are staged through a private blob instead.

## Decisions log

- 2026-11-07: device-first identity, no accounts. Client-side encryption (option A). Email link carries the key; server never stores it.
- 2026-11-07: supplier (Telegram) never named in the product.
- 2026-11-08: "Sign out" means sign out of Google; the device keeps the key.
- 2026-11-08: production on Vercel + Neon + private Blob staging; store moved behind an interface (JSON locally, Postgres in production). Product renamed Stash.

# Loft — product spec (hackathon, 2026-11-07)

**One line:** Unlimited free cloud storage for people who don't want to think about cloud storage. Your files live in your own Telegram; Loft makes it feel like Drive.

**Replaces:** Google One / Drive storage ($1.99–$9.99/mo), Dropbox Plus ($11.99/mo).

**Who it's for:** The person who gets the "Your storage is full" banner and just wants it to go away. Not developers. Non-goal: power users who already run their own Telegram storage scripts.

## Why we win (judging: originality, usefulness, works)

The storage trick is known. The product is the *onboarding*. Our bet: **zero-config** beats every existing Telegram-storage tool, all of which require a bot token, an API ID or a terminal.

## KPIs (what the demo should prove)

| KPI | Target | How we show it |
| --- | --- | --- |
| Clicks from landing to a usable drive | **≤ 3** (Start → Open Telegram → tap Start in Telegram) | On-screen counter on the "You're in" screen |
| Passwords / accounts created | **0** | Copy on the "You're in" screen |
| Time to first file safe | < 60 s | Migration demo with live timer |
| Discovery | Telegram itself: the bot is shareable (`t.me/LoftDriveBot`), every shared file carries a "Stored with Loft" footer; a "Storage full" landing page targeting the Google One upsell moment | Landing page + share footer in demo |

## Demo script (~3 min, judges watch this; everything else is secondary)

1. **Landing** — "Your storage is full" headline, one button: *Get unlimited storage*. (click 1)
2. **Start** — one button: *Open Telegram*. Phone/desktop shows Telegram with a single *Start* tap. (clicks 2, 3) Screen flips to **"You're in. 3 clicks. 0 passwords. 0 GB limit."**
3. **Empty drive** — three big tiles: *Move my Google Drive*, *Back up my phone photos*, *Upload a file*.
4. **Google Drive migration** — click tile → Google consent (simulated in demo mode) → "Found 1,284 files · 14.2 GB" → progress bar → files appear in the drive → **"Done. You can cancel Google One now"** with the link.
5. **Phone photo backup** — scan QR / open `/m` on a phone → one tap *Back up my photos* → 24 photos upload → "Backed up. New photos back up automatically."
6. **Real upload** — drag a real file in, it uploads to Telegram, open it back from Loft. Proves it's real.
7. **Savings tile** — "$119.88/yr → $0".

## Acceptance scenarios (approved by default; edit by number)

### Goal A — Get a working drive with zero configuration
1. Given Maya is on the landing page, when she clicks *Get unlimited storage*, then she sees the Start screen with exactly one primary button, *Open Telegram*.
2. Given Maya is on the Start screen, when she clicks *Open Telegram* and taps *Start* in Telegram, then within 10 s Loft shows "You're in" with her Telegram first name and "3 clicks · 0 passwords".
3. Given Maya has never used Loft, when she lands in her drive, then it is empty and shows the three tiles *Move my Google Drive*, *Back up my phone photos*, *Upload a file*.
4. Given Maya closes the tab and comes back, when she opens Loft, then she is still signed in and sees her files (no re-linking).
5. Given Telegram is not installed on Maya's device, when she clicks *Open Telegram*, then she sees a QR code and a link to install Telegram, not a dead end.

### Goal B — Move Google Drive into Loft
6. Given Maya is in her drive, when she clicks *Move my Google Drive* and approves access, then Loft shows how many files and GB it found before copying anything.
7. Given the scan found 1,284 files, when copying starts, then a progress bar updates at least every 2 s and Maya can keep using her drive meanwhile.
8. Given copying finishes, when Maya looks at her drive, then the files are there in the same folder structure, and a banner says the move is done with a link to cancel Google One.
9. Given copying is interrupted (tab closed), when Maya returns, then it resumes from where it stopped and nothing is duplicated.

### Goal C — Phone photos back up automatically
10. Given Maya opens Loft on her phone, when she taps *Back up my photos* and allows photo access, then her photos start uploading with a count ("12 of 24").
11. Given backup is on, when Maya takes a new photo and opens Loft later, then the new photo is backed up without her doing anything. *(Demo: simulated with a "new photo" button.)*

### Goal D — Files are real and retrievable
12. Given Maya drags `holiday.pdf` into her drive, when the upload completes, then it appears in the list with size and date, and opening it downloads the same bytes.
13. Given Maya opens Telegram, when she looks at her chat with the Loft bot, then `holiday.pdf` is there — she owns her files even if Loft disappears.

### Not in this goal
Sharing links, folders UI beyond what migration creates, search, Dropbox migration (tile shown as "coming soon"), real Google OAuth (simulated in demo mode; real adapter is a stub), >50 MB files (Bot API limit; needs a local Bot API server), encryption at rest (files are in the user's private Telegram chat; Telegram's privacy applies).

## Scope cut line (MoSCoW, practitioner consensus)

- **Must** (demo breaks without it): 1, 2, 3, 6, 7, 8, 10, 12 — and Wren results for Goals A and B.
- **Should**: 4, 13 (real Telegram adapter working with a bot token).
- **Could**: 5, 9, 11.
- **Won't today**: Dropbox, sharing, search.

## Modes
- `DEMO_MODE` (default when no `TELEGRAM_BOT_TOKEN`): Telegram link auto-completes after 2 s, migration and photo backup are simulated with realistic data, uploads are stored locally.
- Real mode: set `TELEGRAM_BOT_TOKEN` in `loft/.env.local`. Linking, upload and download go through the Telegram Bot API. Migration and photo backup stay simulated.

# Open decisions for Olusanya (2026-11-07)

Only the ones that change what the judges see. Everything else I decided; see "Assumptions I made" at the bottom and overrule any you dislike.

## 1. Real Telegram or demo mode for the live demo? ⏱ decides the next 2 hours
Today the app runs in **demo mode**: "Open Telegram" opens a stand-in Telegram screen inside the app (`/tg`) with a real Start button, uploads go to local disk. The real adapter is written (`loft/src/lib/telegram.ts`) but untested: it needs a bot token.

- **A) Real (recommended).** You message @BotFather → `/newbot` → paste the token into `loft/.env.local` as `TELEGRAM_BOT_TOKEN=…` and restart. Then linking, upload and "open in Telegram" are genuinely real on stage, which is the strongest answer to "does it actually work". Migration and photo backup stay simulated. Cost: ~5 min of your time + ~30 min for me to debug the adapter. Risk: Bot API caps files at 50 MB (already handled with a friendly error).
- **B) Demo mode only.** Zero risk, but a judge who asks "is that real?" gets "not yet".
- If unanswered: I keep going with A's code path ready and demo B.

## 2. RESOLVED (2026-11-07, option A): bot chat + client-side encryption
**Revised 2026-11-08 (evening):** accounts with Google sign-in; the key belongs to the account and is held by Stash (see docs/DESIGN.md, Account model). The paragraph below describes the superseded device-key design.

Files are AES-GCM encrypted in the browser before upload; the key lives only on the device (localStorage) and travels to other devices inside a URL fragment: by QR (no server involved) or by email link (decided 2026-11-07 evening: the key is written into the email by the server and never stored, so the claim is "Loft never stores your key"; links are single-use, 24 h). A recovery code remains as the lost-every-device fallback. Passkeys are the roadmap for a zero-knowledge email path. Storage is Loft-operated (a Loft-owned chat); Loft and the supplier only ever hold ciphertext. The user never hears "Telegram". The "files outlive Loft" claim is dropped.

<details><summary>Original question</summary>

## 2. Is "your files live in a Telegram bot chat" the right ownership story?
Right now files are sent to the user's private chat with the Loft bot. Users can see them in Telegram, which is the "you own it even if Loft dies" story on the landing page.

- **A) Bot chat (current, recommended for today).** Zero-config, works with Bot API. Downside: a 50 MB/file limit and the files sit with a bot, not in "Saved Messages".
- **B) User's own account via MTProto (Saved Messages, 2–4 GB files).** The "proper" version, but needs phone number + SMS code onboarding, which kills the 3-click story, and it's a day of work. Not for today; mention as the roadmap in the pitch.

</details>

## 3. Who is the pitch for? (shapes the landing copy and the demo opening)
I wrote the landing page for **"Google storage is full" person**, i.e. a consumer hit by the Google One upsell, saving ~$120/yr. Alternatives: students (Caribbean/CSEC angle you know well), or families (shared photo backup). The demo flow is the same; only the headline and the savings tile change. Tell me if you want the headline swapped.

## 4. Name: "Loft"
Working name, unchecked for trademarks. Alternatives in the same vein: Attic, Hollow, Stash. Takes 1 min to swap.

## 5. Deployment for judges and Wren
No Vercel/Netlify/gh CLI is logged in on this machine, so I'm using a **Cloudflare quick tunnel** (URL changes each restart) for Wren runs. For the demo I'll run localhost. If you want a stable public URL, log in to Vercel (`npx vercel login`) and I'll deploy; the app has no external services so it deploys as-is. Note the JSON-file store means Vercel would reset data on every cold start; fine for a demo, and the "reset demo" link exists anyway.

---

## Assumptions I made (overrule freely)
- **Style:** warm cream + ink + one orange accent, serif headlines (Fraunces), one primary action per screen, big type. Deliberately not "developer dark mode"; the audience is non-technical.
- **Copy voice:** plain, second person, no jargon. "You're in. 3 clicks. 0 passwords. ∞ storage."
- **Clicks counted as:** landing CTA → Open Telegram → Start (in Telegram) = 3. Shown on the "You're in" screen as the KPI.
- **Discovery story:** the bot itself is the growth loop (every shared file carries "Stored with Loft"), plus a landing page aimed at the exact moment Google shows "storage full". Not built, just pitched.
- **Migration is simulated** with a believable 1,284-file / 14.2 GB Google Drive and real folder structure. Real Drive OAuth is out of scope today; the dialog mimics Google's consent screen so the demo reads correctly.
- **Dropbox** is not mentioned in the UI at all (less to explain). Can add a "coming soon" tile.
- **Photo backup** uses a drawn camera roll (gradients) rather than real photo-library access. There's a "Pretend I took a new photo" demo button to show the automatic part.
- **Real-Telegram UX gap (found by you):** on desktop web, `t.me` shows an interstitial ("Send Message") before the app opens. The waiting screen now lists the exact presses: Send Message → Start → come back. Worth watching in the live demo; on a phone the deep link goes straight into the app.
- **Wren tests** cover 4 flows (onboarding, migration, photo backup, upload); the hackathon needs 2.
- Nothing is committed to git yet (no repo existed and you didn't ask). Say the word and I'll `git init` + commit.

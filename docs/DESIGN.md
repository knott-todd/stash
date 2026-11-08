# Loft — design (landing page), 2026-11-07

Companion to `BRAND-BRIEF.md`. The brief says why; this says what, with values an engineer can copy.

## Process that produced this
Discovery (two rounds, see brief) → signed brief → lo-fi wireframe → sign-off → build. Colour was chosen last, against contrast numbers. Standards: Nielsen's heuristics for usability, WCAG 2.2 AA for accessibility, DTCG naming for tokens.

## The page (signed wireframe)
One screen, no scroll on a phone. Top: wordmark, "Sign in". Middle: the three-word promise, one sentence, one button, one reassurance line. Bottom: one system-tone line. Nothing else. Removed on purpose: hooks, savings maths, how-it-works, feature cards, metaphors, any mention of Telegram (users don't need the mechanism).

## Copy (final)
| Element | Text | Proves |
| --- | --- | --- |
| Promise | Free. / Unlimited. / Private. / Storage. | all three, said once; the noun closes the sentence |
| Support | (none) | the headline is the whole claim; "storage, that's it" |
| Button | Switch to Loft in 3 easy steps | ease of setup, the fourth selling point; 3 = Switch → Move my Google Drive → Allow |
| Reassurance | No account. No card. | answers the "scam" fear |
| Footer | Encrypted on your phone before it leaves. | Private (true once client-side encryption ships) |
| Header link | Sign in | returning users → /drive |

## Tokens (`loft/src/app/landing.css`, scoped to `.landing`)
| Token | Value | Role | Contrast |
| --- | --- | --- | --- |
| `--l-bg` | `#fafafa` | page background | — |
| `--l-ink` | `#111111` | headline, wordmark | 18.3:1 on bg |
| `--l-ink-2` | `#6b6b6b` | support, reassurance, footer, quiet link | 5.1:1 on bg (AA body) |
| `--l-button` | `#111111` | the one button | — |
| `--l-on-button` | `#ffffff` | button label | 18.3:1 |
| `--l-focus` | `#111111` | focus ring, 2px, offset 3px | 18.3:1 on bg |
| `--l-gutter` | `16px` (48px ≥768px) | side padding | |
| `--l-measure` | `34rem` | max column width | |

| `--l-brand` | `#1f45d8` | the one colour; "Storage." in the headline only | 6.6:1 on bg |
| `--l-line` | `#e4e4e4` | hairline above the answers | — |

One brand colour, used once, so the noun stands apart from the three adjectives. Everything else is ink; the button is ink. Contrast computed with WCAG relative luminance, not eyeballed.

## Answers section (below the hero)
Three headings that repeat the promise, each with one paragraph that says how, without saying "how we deliver":
- **Free.** There is no plan to upgrade to. The storage behind Loft costs us nothing to give, so there is no bill to pass on. No tiers, no trial, no card.
- **Unlimited.** No quota. Add a file today and ten thousand next year; the price stays the same. You will never see "storage full" again.
- **Private.** Every file is encrypted on your device before it leaves. Only your device holds the key. We cannot read your files, and neither can anyone we store them with.
Desktop: three equal columns in a 64rem centred row under a hairline; mobile: stacked. Headings 1.75rem/1.5rem, body ink-2, max 28rem.

## Type
One family: Geist (`--font-geist-sans`, already loaded). Fraunces and Geist Mono are not used on this page.
- Promise: `clamp(2.75rem, 11vw, 4.5rem)`, weight 600, line-height 1.02, tracking −0.035em, one word per line.
- Support: 1.125rem / 1.5, ink-2, max 24rem.
- Button: 1.0625rem, weight 500.
- Reassurance / footer: 0.9375rem / 0.875rem, ink-2.

## Layout
Mobile (375px) is the design: left-aligned column, full-width button, hero vertically centred by flex, footer pinned by `min-height: 100dvh`. Desktop keeps the same column (max 34rem, 48px gutter) and leaves the rest of the viewport empty; the button becomes auto-width (min 12rem). Reflows to 320px with no horizontal scroll.

## Motion
None. The page is static; a load fade was tried and removed as decoration.

## Desktop (≥1024px)
Centred composition: header spans the page (wordmark left, Sign in right); the hero fills the first screen and centres a block whose words are left-aligned (the headline, button and reassurance share the block's left edge); the answers row and footer sit in a centred 64rem column. Promise `clamp(3.25rem, 4.6vw, 4.25rem)` (66px at 1440), line-height 1.08; button auto-width, 56px tall, min 16rem, centred. Fits 1440×900 with no scroll. The desktop block sits last in `landing.css` so it wins the cascade. Mobile keeps the left-aligned layout. The demo runs on desktop, so this is the breakpoint checked most carefully.

## States
The page has no data, so no loading/empty/error states. Links: `Get started` → `/start`, `Sign in` → `/drive` (redirects to `/start` if not linked). Keyboard order: wordmark → Sign in → Get started. Target sizes ≥ 24×24 CSS px (button 52px tall; Sign in has 8px vertical padding).

## Rules for anything added later
Each addition must name which of the three words it proves. If it can't, it doesn't go on this page. Keep one typeface, two colours of text, one button.

## Recovery model (decided 2026-11-08)

The key exists only on the user's devices. Adding a device means carrying the key, never fetching it from Stash.

| Situation | How the key arrives | User steps |
| --- | --- | --- |
| New phone of the same kind (same Apple ID / Google account), native app | OS keychain backup restores it | 0 |
| Second device, or switching iPhone ↔ Android | QR from a device that has it, or the emailed link (key in the link, single-use, 24 h) | 1 |
| Everything lost | Recovery code (26 chars, shown once, Crockford base32) | type it |
| Later | PIN-protected escrow in hardware (Signal/WhatsApp pattern) or passkeys (WebAuthn PRF) | PIN or Face ID |

An email on file names the drive (which one is yours); it never carries the key by itself. This is what "account" means in Stash: passwordless, identity only.

## Journeys (end state first; steps counted honestly, OS prompts included)

Written one at a time, trimmed afterwards. Journey 1 (phone photos) is agreed: 3 taps to start, a wait that must survive the phone being put down, zero steps forever after, with iOS "shortly after" honesty; it depends on the native app, background transfer, the 20 MB cap being lifted, and a per-photo "verified" state before anyone deletes from the phone.

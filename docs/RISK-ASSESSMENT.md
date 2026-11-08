# Stash risk assessment (2026-11-08)

Two standard lenses, applied to the code as it is on `main` at d4fc0f5:

- **Security: STRIDE** (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege), the threat-modelling categories from Microsoft's SDL. Each threat is scored with the **OWASP Risk Rating Methodology**: likelihood × impact, each Low / Medium / High, giving Low / Medium / High / Critical overall. Controls are referenced to **OWASP ASVS 4.0** (Application Security Verification Standard) section numbers so a later audit can check them.
- **Resiliency: FMEA** (failure mode and effects analysis, IEC 60812). Each failure mode gets Severity, Occurrence and Detection on 1–10, multiplied into a Risk Priority Number (RPN, max 1000). Detection scores high when nobody would notice.

Scope: the web app on Vercel, the Neon catalogue, Telegram storage through the operator bot, Stash Desktop, the phone app scaffold, Google/Dropbox/OneDrive moves. Out of scope: Google's, Vercel's, Neon's and Telegram's own internals, except as dependencies.

## 1. What is being protected

| Asset | Where | Who may see it |
| --- | --- | --- |
| File contents | Telegram (ciphertext), browser cache (ciphertext), Stash Desktop reads plaintext from disk | The owner. Stash itself only on Standard accounts, and only when asked (share links). |
| Per-account file key | Neon `users.data.key` (Standard) or passcode-wrapped `keyWrapped` (Locked); browser localStorage; `~/.stash/config.json` on linked computers (plain, and the unwrapped key for Locked) | Owner's devices; Stash's server on Standard. |
| Catalogue (names, sizes, folders, dates, device ids) | Neon | Owner, Stash operator. |
| Identity | Google `sub`, email, name, picture; session ids in Neon `kv`; device tokens (hashed) | Owner, operator. |
| Operator secrets | Telegram bot token, Google client secret, DB URL, SMTP (unused) | Vercel env. |

Trust boundaries: browser ↔ Vercel functions; Vercel ↔ Neon; Vercel ↔ Telegram; linked device ↔ Vercel; stranger ↔ share link.

## 2. The question asked: a chunked upload fails midway

Walk-through of `uploadEncrypted` (browser) and `Api.uploadFile` (desktop) against the server routes.

1. The client encrypts piece *i* and POSTs it to `/api/files/part`. The server stores it in Telegram at once and answers with a pointer `{tg:{fileId,messageId},size}`. **Nothing is written to the catalogue.**
2. Steps repeat, two pieces in flight in the browser, one at a time on desktop. A 503 "storage busy" is retried after the wait the server names (up to 3–4 tries); a network error or a 5xx after retries throws.
3. After the last piece the client POSTs `/api/files` with the list of pointers; only then does the file exist in the catalogue.

What happens at each failure point:

| Failure | Result today | Who notices |
| --- | --- | --- |
| Piece *k* fails after retries | Pieces 0..k−1 sit in Telegram with no catalogue row, forever. Browser: toast with Retry; the retry starts again from piece 0. Provider copy: counted as failed, retried on the next run from piece 0. Desktop: counted as failed, retried on the next pass from piece 0. | The user sees the file is missing. Nobody sees the orphaned pieces. |
| Tab closed or laptop sleeps mid-upload | Same as above, no toast. | User, when they look for the file. |
| All pieces sent, the register request fails | All pieces orphaned; the retry re-sends every piece. | User. |
| Telegram stores a piece but the response is lost | One orphaned piece; the client retries that piece, so the file still completes. | Nobody. |
| Register succeeds, the browser's local cache write fails | Harmless; the next open downloads it. | Nobody; nothing lost. |
| A piece is corrupted in transit or at rest | AES-GCM's tag check fails on that piece at open time → "Couldn't open". No way to repair from the client. | User, at open time, possibly months later. |

Two consequences matter. **Correctness:** no half-registered file can appear, because registration is the last step, and every piece carries its own authentication tag, so a damaged or missing piece is detected (though not repaired) on open. **Waste and resumability:** every failure leaks pieces into storage that nothing tracks and nothing cleans, and every retry starts from zero. For a 2 GB video on a flaky connection that is the difference between "finishes eventually" and "never finishes".

There is also a security problem hiding in the same design, covered as T-1 below: the server trusts the piece pointers the client sends at registration.

## 3. STRIDE threats

Scored L = likelihood, I = impact, R = overall (OWASP Risk Rating).

### Spoofing

| # | Threat | Evidence | L | I | R | Fix | ASVS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S-1 | Guessing a device link code (6 chars, 32-symbol alphabet, 15 min) to attach a stranger's computer to an account | `devices.ts makeCode`; no rate limit anywhere in the app | Low (≈1e9 codes, but unlimited guesses) | High (attacker's device receives the account key and every file) | Medium | Rate-limit `/api/devices/link/approve` and the poll endpoint per IP and per session (Vercel KV or Neon counter); lock a code after 5 wrong tries; approval screen already shows name and platform | 2.2.1, 11.1.4 |
| S-2 | Replaying a stolen session cookie | `stash_sid` never expires server-side; 1-year cookie; no "sign out everywhere" | Medium | High | **High** | Session TTL (30 days idle), rotate on sign-in, list and revoke sessions in Settings, bind to a user-agent hash as a weak signal | 3.3.1–3.3.4 |
| S-3 | OAuth code injection / CSRF on sign-in | `beginOAuth` nonce in httpOnly cookie, checked in `takeOAuthState`; id_token verified via Google tokeninfo with `aud` check | Low | High | Low | Keep; add `nonce` claim to the OpenID request and check it in the token | 3.5 |

### Tampering

| # | Threat | Evidence | L | I | R | Fix | ASVS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **T-1** | **A signed-in user registers a file whose piece pointers belong to someone else's objects.** `POST /api/files` (JSON) and `PUT /api/files/:id/thumb` accept any `{tg:{fileId,messageId},size}` the client sends; `isPart` checks shape only. Telegram `file_id`s are not secret from the bot's point of view. Anyone who learns another user's `file_id` (a log, a browser devtools capture on a shared machine, a future bug that leaks it) can attach it to their own catalogue and download it. The bytes are still ciphertext under the victim's key, so Standard-account victims are exposed only if the attacker also has the key; but the attacker can **delete** the victim's objects: `DELETE /api/files/:id` calls `deleteObjects` on every pointer, including the victim's `messageId`. | `files/route.ts` lines 40–44; `thumb/route.ts` PUT; `deleteObjects` | Medium (needs a leaked id; ids are not currently exposed to the browser, but the design relies on that staying true) | High (irreversible deletion of someone else's data) | **High** | Make the server the only source of piece pointers: `/api/files/part` records each stored piece in `kv` under `upload:<uploadId>` with the owner's uid; registration takes `uploadId` and the server assembles the list from its own records; same for thumbs. This also enables resumable uploads and orphan cleanup (R-1). | 4.2.1, 13.1.4 |
| T-2 | Splicing pieces between two of the owner's own files (same key) to make a Frankenstein file | Pieces are not bound to a file id in the AES-GCM additional data | Low | Low | Low | Pass `fileId‖index` as GCM additional authenticated data once uploads have a server-issued id | 6.2 |
| T-3 | A linked device changes account settings | `/api/account/protection` and `/api/devices/link/approve` refuse `s.deviceId`; verified by test | Low | Medium | Low | Keep | 4.1 |

### Repudiation

| # | Threat | Evidence | L | I | R | Fix | ASVS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Rp-1 | No record of who deleted or shared what, from which device, when | No audit log; Vercel function logs are transient | High (certain) | Medium | Medium | Append-only `events` table: uid, deviceId, action, fileId, time; show "Activity" in Settings; keeps "did Stash lose my file or did I delete it" answerable | 7.1, 7.2 |

### Information disclosure

| # | Threat | Evidence | L | I | R | Fix | ASVS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **I-1** | **Stored cross-site scripting through a shared file served inline.** `/api/share/<token>?inline=1` serves *any* mime inline. Share an uploaded `.html` (or `.svg`) file, open the link with `inline=1`, and the page runs on `stash.olusanyatodd.com`. A victim who is signed in and clicks such a link runs the attacker's script with the victim's cookie: it can list, download and delete the victim's files through the same-origin APIs. The share page itself only embeds image/video/PDF, but the endpoint does not enforce that. | `share/[token]/route.ts` line 26–30 | Medium (needs a victim to click a link, which is what share links are for) | High (full account actions as the victim) | **High** | Allow `inline` only for `image/*` (not svg), `video/*`, `application/pdf`; always send `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox` on served file bytes; better, serve bytes from a separate origin (e.g. `files.stash…`) so nothing user-supplied ever runs on the app origin | 5.3.3, 14.4.1, 14.4.3 |
| **I-2** | **Self/XSS via SVG opened from the drive.** `viewableMime` returns the mime for every `image/*`, including `image/svg+xml`; `open()` creates a `blob:` URL with that type and opens it in a tab. A `blob:` URL inherits the app's origin, so script inside an SVG runs with access to the session. The SVG must be in the victim's own drive, which a Google Drive move or a desktop folder can put there without the victim ever looking at it. | `view.ts` line 10; `Drive.tsx open()` | Medium | High | **High** | Treat `image/svg+xml` as download-only, or render it inside a sandboxed `<iframe sandbox>`; same for `text/html` (already forced to `text/plain`, good) | 5.3.3 |
| I-3 | Database leak exposes Standard accounts' keys next to their catalogue; with the bot token, that is plaintext for every Standard user | Keys stored as plain JSON in `users.data.key` | Low (Neon credentials live only in Vercel env) | High | Medium | Envelope-encrypt `key` at rest with a server master key kept only in Vercel env (never in Neon); a DB-only leak then yields ciphertext; rotate the master key on a schedule | 6.4, 8.3.4 |
| I-4 | Share link token leaks through referrers, browser history, chat previews | 18-byte token, `cache-control: no-store`; no expiry, no password | Medium | Medium | Medium | Optional expiry and passcode on links; `Referrer-Policy: no-referrer` on the share page; list and revoke all links in Settings | 8.3.1 |
| I-5 | Catalogue metadata (file names, folder names, device names, counts) is readable by the operator and in any DB leak | By design; names are not encrypted | Certain | Low–Medium | Medium | Document in the privacy page (done in part). Encrypting names client-side breaks search and sharing; defer unless demanded | 8.3 |
| I-6 | Locked accounts: Stash Desktop writes the unwrapped key and the device token to `~/.stash/config.json` in plain text | `config.mjs saveConfig` | Medium | Medium | Medium | Use the OS keychain (Windows Credential Manager / macOS Keychain via `keytar` or DPAPI); at least `chmod 600`; say in the Locked copy that linked computers hold what they need to back up | 2.10, 8.2 |
| I-7 | `?diag=1` on `/api/me` lists which env vars exist and the DB host label to anyone | `me/route.ts` | Certain | Low (names only, no values) | Low | Require sign-in or remove once production is stable | 14.3.2 |
| I-8 | Missing browser security headers (no CSP, no `X-Content-Type-Options`, no `Referrer-Policy`, no `frame-ancestors`) | `next.config.ts` has none | Certain | Medium (turns small bugs into exploitable ones) | Medium | Add a `headers()` block: CSP with `default-src 'self'` plus Google avatars, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` | 14.4 |

### Denial of service

| # | Threat | Evidence | L | I | R | Fix | ASVS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **D-1** | **One tenant exhausts the shared Telegram bot.** All users' pieces go through one bot to one chat; Telegram throttles the bot as a whole (seen: `retry after 434 s`). One large first backup, or one abuser, pauses uploads for everyone; the app reports "storage is busy" honestly but cannot isolate tenants. | `telegram.ts`; a single `STASH_STORAGE_CHAT_ID` | High | High | **Critical** (for a product with more than a few users) | Per-user upload budget (bytes/hour) enforced server-side; a queue with fairness instead of first-come; several bots and chats with per-user assignment (Telegram limits are per bot); long term, storage under the user's own control. Also cap concurrent pieces per account. | 11.1.4 |
| **D-2** | **Neon free-tier egress exhaustion by design, again.** Every `/api/files` returns the whole catalogue; `/api/me`, `/api/devices` and `/api/photos` each call `filesFor(uid)`; the Devices page polls `/api/devices` every 10 s; the drive refreshes after every upload. At 50k files (the hackathon's own Drive) one listing is several MB; the earlier outage was exactly this shape. | `filesFor` call sites; `Devices.tsx` 10 s poll | High | High (every query returns 402; the app is down for everyone) | **Critical** | Summary counters on the user row (file count, bytes, per-device counts) maintained on write; paginated listing with a since-cursor; the Devices page polls device rows only; cache listing per session; alert at 50 % of the monthly egress | — |
| D-3 | No rate limiting on any endpoint | Confirmed | High | Medium | High | Rate limits on auth, link, share, part upload; return 429 with `retry-after` | 11.1.4 |
| D-4 | Unauthenticated `/api/devices/link` POST creates kv rows at will | `startLink` has no limit | Medium | Low | Low | Rate limit; TTL already 15 min | 11.1.4 |
| D-5 | Large file open loads the whole ciphertext and plaintext into browser memory (`decryptChunked` concatenates) | `crypto.ts` | Medium | Low (one tab crashes) | Low | Stream decrypt to a `WritableStream` via the File System Access API for downloads; cap "Open in tab" at 256 MB with a clear message | — |

### Elevation of privilege

| # | Threat | Evidence | L | I | R | Fix | ASVS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E-1 | Dev sign-in route reachable in production | Refused unless `STASH_DEV_SIGNIN` set and never when `VERCEL` is set; verified 404 on production | Low | High | Low | Keep; also exclude the route from the production build | 2.1 |
| E-2 | Cross-site request forgery on state-changing routes | Cookies are `SameSite=Lax`; JSON bodies cannot be sent cross-site with cookies; multipart form posts cross-site do not carry Lax cookies on POST | Low | Medium | Low | Add `Origin` header check on mutating routes as a second layer | 4.2.2 |
| E-3 | A linked device uploads into folders or sources it should not (e.g. claims `source: "phone"`) | Source and folder are client-supplied strings | Medium | Low | Low | Fine for now; audit log (Rp-1) makes it visible | — |

## 4. FMEA: resiliency

S = severity, O = occurrence, D = detection (10 = nobody would notice), RPN = S×O×D.

| # | Failure mode | Effect | Cause | S | O | D | RPN | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **R-1** | Chunked upload stops midway (section 2) | Orphaned pieces accumulate in Telegram; retries restart from zero; large files on poor links never finish | No upload session on the server; no piece ledger; no sweeper | 6 | 8 | 9 | **432** | Server-issued `uploadId`; ledger of pieces per upload; `GET /api/uploads/:id` tells the client which pieces exist so it resumes; daily sweeper (Vercel cron, free tier allows one a day) deletes uploads older than 24 h that were never registered |
| **R-2** | Neon returns 402 (quota) or is suspended | Every page and API fails; files are safe but unreachable; the desktop agent reports "unlinked"-like errors | Egress (D-2), compute hours, or an unpaid-tier change | 9 | 6 | 3 | 162 | D-2 fixes; weekly catalogue export to a Telegram message (the catalogue is small once listings are not on hot rows) so the index can be rebuilt; the app shows a plain "Stash is temporarily unavailable; your files are safe" page on DB errors instead of 500s |
| **R-3** | Catalogue data loss (bad migration, accidental `reset`, Neon branch deleted) | Files exist in Telegram but nothing points at them; effectively lost | Single store, no backups beyond Neon's own point-in-time window | 10 | 2 | 4 | 80 | Nightly catalogue dump to a second place (Telegram message or Vercel Blob) plus the pieces' captions already carry `uid/name`, so a recovery scan of the storage chat could rebuild most of the index; write that recovery script before it is needed |
| **R-4** | Telegram deletes, expires or blocks the bot's files, or changes policy | Total data loss for everyone | Free unlimited storage is a policy, not a contract | 10 | 2 | 2 | 40 | The honest answer: Stash Desktop keeps a local copy of what it sent (it already has the originals on disk; keep them); export everything exists; consider a second bot in a second chat as a mirror for the catalogue, not the bytes; say the limit out loud in "What we can't do" |
| R-5 | A piece is corrupted at rest | That file cannot be opened; GCM tag fails | Storage bit-rot, truncated download | 7 | 1 | 8 | 56 | Verify-after-upload option for the desktop agent (download, decrypt, compare hash, mark verified); show "verified" in the catalogue; it is also the trust feature the roadmap ideas list asks for |
| R-6 | Telegram rate limit during a big first backup | Uploads pause for everyone (D-1); the desktop agent waits and retries; the browser copy shows "busy" | Shared bot | 6 | 8 | 2 | 96 | D-1 fixes; the agent should back off exponentially and report "waiting for storage" on the Devices page so the pause is visible, not mysterious |
| R-7 | Vercel function time limit mid-download of a very large pieced file | Download truncated; browser decrypt fails on the last piece or hangs | 300 s limit; sequential piece fetch | 5 | 3 | 5 | 75 | Support HTTP `Range` on `/api/files/:id/download` so the browser can fetch pieces in parallel and resume; the fixed piece size makes ranges trivial |
| R-8 | Desktop agent state file lost or corrupted (`~/.stash/state.json`) | Everything re-uploaded as new copies; duplicates in the drive | Crash during write (write is atomic via rename, so mostly a disk problem) | 4 | 2 | 6 | 48 | Content hash per file in the state; before uploading, ask the server whether a file with that hash and path exists (needs a hash column) |
| R-9 | Desktop agent reports stale status (laptop asleep) | Devices page shows "up to date" from hours ago as if current | Last-seen is shown, status is not aged | 3 | 7 | 4 | 84 | Already shows "Not running right now" after 5 min; also grey out folder stats with their age |
| R-10 | Google consent screen still in Testing | Only test users can sign in; everyone else is turned away with a Google error | Unpublished OAuth app | 7 | 10 | 1 | 70 | Publish (a button for sign-in scopes). Until then the sign-in page should say who can sign in |
| R-11 | Session kv rows and link rows grow forever | Slow kv scans are not a problem (keyed), but storage creeps | No TTL on sessions, expired links are only deleted when polled | 2 | 9 | 7 | 126 | TTLs and the same daily sweeper as R-1 |
| R-12 | Provider move interrupted (tab closed) | Resumes on next open via the done-set; files already copied are not duplicated | Done-set in localStorage only | 3 | 6 | 2 | 36 | Move the done-set to the server (per provider per user) so a second device or a cleared browser does not re-copy |

## 5. Priorities

Ordered by the score, then by how cheap the fix is.

1. **D-2 egress by design** (Critical, cheap): counters on the user row, paginated listing, stop polling the full catalogue. One evening. Prevents a repeat of the one outage that has actually happened.
2. **T-1 + R-1 upload sessions** (High + RPN 432, one change): server-issued upload ids, a piece ledger, resume, sweeper. Fixes the ownership hole and the "fails midway" problem together. One evening.
3. **I-1, I-2, I-8 content-serving and headers** (High, cheap): inline only for safe types, SVG as download, nosniff, CSP, sandbox. One hour.
4. **S-2 sessions** (High, small): idle TTL, sign out everywhere, rotate on sign-in. Two hours.
5. **D-1 shared bot** (Critical at scale, bigger): per-user budgets and fairness now; multiple bots when there are users to justify it.
6. **D-3 rate limits** (High, small): auth, link, share, part.
7. **I-3 key envelope encryption** (Medium, small but needs a migration).
8. **R-3 catalogue backup and the recovery script** (RPN 80 but severity 10): write the rebuild-from-captions script before it is needed.
9. Rp-1 activity log, I-4 link expiry, I-6 keychain for the desktop agent, R-5 verify-after-upload.

## 6. What is already sound

- Encryption before storage with a unique IV per piece and GCM integrity; the storage provider only ever holds ciphertext.
- Sign-in via Google with nonce-checked OAuth state and server-verified id tokens; no passwords to leak.
- Device tokens stored hashed; revocation is immediate; link codes expire; device sessions cannot change account settings.
- Locked mode: PBKDF2 600k rounds, the wrapped key only, a recovery code shown at the moment of choice.
- httpOnly, SameSite=Lax, Secure cookies; dev sign-in dead on Vercel; share links are 144-bit random; all file routes check ownership by `uid`.
- Registration last: no half-uploaded file can appear in the drive, and an interrupted move resumes without duplicates.

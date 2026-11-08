# OWASP ASVS 4.0.3, Level 1: item-by-item

All 128 Level 1 requirements, taken from OWASP's own CSV (`4.0/docs_en/…4.0.3-en.csv`), judged against `main` 808ccf4 on 2026-11-08. Each row names the evidence. Verdicts: **Pass**, **Fail**, **Partial**, **N/A** (the requirement does not apply to this design). Three uncommitted edits on disk (security headers, safe inline types on share, SVG as download) are noted where they would change a verdict.

Totals: 71 Pass, 17 Fail, 9 Partial, 31 N/A.

## V2 Authentication (27)

Stash has no passwords: identity is Google sign-in (OpenID Connect). Locked mode has a passcode that derives a key; it is not an authenticator to Stash, so password rules apply to it only by analogy and are marked N/A with a note.

| Req | Verdict | Evidence |
| --- | --- | --- |
| 2.1.1 passwords ≥12 chars | N/A | No passwords. The Locked passcode minimum is 6 (`Protection.tsx SetPasscode`); as a key-derivation secret with PBKDF2 600k it is weak against offline guessing if the wrapped key leaks. Recommend 12. |
| 2.1.2 ≥64 permitted, >128 denied | N/A | Passcode: no upper cap; harmless. |
| 2.1.3 no truncation | N/A | Passcode normalised NFKC, not truncated (`crypto.ts passcodeKey`). |
| 2.1.4 any Unicode | N/A | Passcode accepts any string. |
| 2.1.5 can change password | N/A | Passcode can be changed by switching to Standard and locking again; no direct "change passcode". |
| 2.1.6 change requires current | N/A | Switching off Locked requires the current passcode (`AskPasscode`). |
| 2.1.7 breached-password check | N/A | |
| 2.1.8 strength meter | N/A | None for the passcode. |
| 2.1.9 no composition rules | N/A | None. |
| 2.1.10 no rotation | N/A | None. |
| 2.1.11 paste allowed | N/A | Plain inputs; paste works. |
| 2.1.12 reveal masked | N/A | No reveal toggle on the passcode field. |
| 2.2.1 anti-automation, ≤100 fails/hour | **Fail** | Device link code approval and polling have no attempt limit (`devices/link/approve`, `devices/link`); sign-in itself is Google's. |
| 2.2.2 weak authenticators secondary only | Pass | Only Google sign-in; no SMS/email. |
| 2.2.3 notify on auth changes | **Fail** | No notification on new sign-in, new device link, or protection change. |
| 2.3.1 initial secrets random, ≥6 chars, expire | Pass | Link codes: 6 chars from 32 symbols via `randomBytes`, 15 min TTL (`devices.ts`). |
| 2.5.1 recovery secret not sent clear | Pass | Recovery code is shown on screen once, never emailed (`Protection.tsx`). |
| 2.5.2 no hints/secret questions | **Partial** | The Locked passcode has an optional free-text "hint" shown to anyone who reaches the prompt (`keyWrapped.hint`). It is optional and labelled as public, but it is a hint by definition. Consider removing. |
| 2.5.3 recovery never reveals current secret | Pass | The recovery code is the key itself, by design, shown only to the signed-in owner after a passcode is set or after entering the passcode in Settings. |
| 2.5.4 no default accounts | Pass | None; `api/auth/dev` disabled on Vercel. |
| 2.5.5 notify when factor changes | **Fail** | See 2.2.3. |
| 2.5.6 secure recovery mechanism | Pass | Offline recovery code (26-char Crockford base32 of the key). |
| 2.7.1 no clear-text OOB by default | N/A | No OOB authenticators. |
| 2.7.2 OOB codes expire ≤10 min | **Partial** | Device link codes expire at 15 min (`LINK_TTL`). Set to 10. |
| 2.7.3 OOB codes single use | Pass | `collectLink` deletes the link on first collection; `approveLink` refuses an already-approved link. |
| 2.7.4 OOB secure channel | Pass | HTTPS both sides. |
| 2.8.1 TOTP lifetime | N/A | |

## V3 Session Management (12)

| Req | Verdict | Evidence |
| --- | --- | --- |
| 3.1.1 no session tokens in URLs | Pass | Cookie only; device tokens in the Authorization header. |
| 3.2.1 new token on authentication | Pass | `startSession` mints a new id on every sign-in. The old session row is not deleted (see 3.3.1). |
| 3.2.2 ≥64 bits entropy | Pass | Session id = three `newId()` (Math.random + time, ~90 bits combined); device token 256 bits; link secret 128 bits. **Note:** `newId` uses `Math.random`, not CSPRNG; adequate for ids whose compromise needs the kv table, weak as a standard. Use `randomBytes`. |
| 3.2.3 secure browser storage | Pass | httpOnly cookie. |
| 3.3.1 logout invalidates server-side | **Partial** | `endSession` deletes the kv row (good). Expiry never happens server-side, and a replaced session on re-sign-in is left alive. |
| 3.3.2 periodic re-authentication | **Fail** | 1-year cookie, no idle or absolute timeout. |
| 3.4.1 Secure attribute | Pass | `secure: NODE_ENV === "production"` (`session.ts`). |
| 3.4.2 HttpOnly | Pass | |
| 3.4.3 SameSite | Pass | Lax. |
| 3.4.4 `__Host-` prefix | **Fail** | Cookie named `stash_sid`; `__Host-stash_sid` would pin it to the host. |
| 3.4.5 precise path | Pass | Single app on the host; path `/`. |
| 3.7.1 full session for sensitive changes | Pass | Protection change, adoption, sharing, approvals require a browser session (`s.deviceId` refused). No re-authentication step for them, which L1 does not demand. |

## V4 Access Control (8)

| Req | Verdict | Evidence |
| --- | --- | --- |
| 4.1.1 enforced server-side | Pass | Every route re-checks the session and `uid`. |
| 4.1.2 policy data not user-controlled | **Fail** | Piece pointers accepted from the client at registration (`POST /api/files` JSON, `PUT …/thumb`); see THREAT-MODEL P4-T. |
| 4.1.3 least privilege | Pass | Device tokens cannot change account settings or approve devices. |
| 4.1.5 fail securely | Pass | Missing session → 401 before any work; exceptions bubble to a 500 with no data change. |
| 4.2.1 IDOR | Pass (with 4.1.2 caveat) | All file, device and share lookups are `(uid, id)`. |
| 4.2.2 anti-CSRF | Pass | SameSite=Lax cookies; mutating routes take JSON or multipart; no form posts. No Origin check as second layer. |
| 4.3.1 admin MFA | N/A | No admin interface. |
| 4.3.2 directory browsing off | Pass | Next.js serves only built routes. |

## V5 Validation, Sanitization and Encoding (27)

| Req | Verdict | Evidence |
| --- | --- | --- |
| 5.1.1 parameter pollution | Pass | Body JSON and typed `searchParams.get` (first value). |
| 5.1.2 mass assignment | **Partial** | `POST /api/files` multipart spreads every string field of the form into `meta` and reads only known keys afterwards (ok); `PATCH /api/files/[id]` reads `name` and `folder` only (ok); `POST /api/files` JSON spreads `body` into `meta` then picks known keys (ok). `devices/me` maps fields explicitly (ok). Pass in effect; marked Partial for the spread pattern. |
| 5.1.3 allow-list validation | **Partial** | Sources, protection modes, provider ids, tokens are allow-listed or regex-checked; file names and folders are length-capped free text (acceptable). Share token and upload ids regex-checked. |
| 5.1.4 structured data typed | Pass | Sizes cast with `Number`, iter bounds checked for wrapped keys. |
| 5.1.5 redirects allow-listed | Pass | `safeNext` same-origin only; OAuth hosts fixed. |
| 5.2.1 HTML sanitiser | N/A | No HTML input. |
| 5.2.2 unstructured data sanitised | Pass | Lengths capped (names 255, folders 500, device names 60). |
| 5.2.3 mail injection | N/A | Mail removed. |
| 5.2.4 no eval | Pass | grep: none. |
| 5.2.5 template injection | N/A | No server templates with user input; React escapes. |
| 5.2.6 SSRF | Pass | Outbound hosts are fixed strings; provider file ids only in paths/JSON to those hosts. |
| 5.2.7 SVG sandboxed | **Fail** (Pass with the uncommitted `view.ts` edit) | A user's SVG opens as a `blob:` on the app origin. |
| 5.2.8 Markdown/CSS/XSL | N/A | |
| 5.3.1 context-aware encoding | Pass | React; `encodeURIComponent` in `Content-Disposition`; desktop UI uses `esc()` for every dynamic value. |
| 5.3.2 Unicode preserved | Pass | UTF-8 throughout; `filename*=UTF-8''`. |
| 5.3.3 XSS protection | **Fail** (Pass with the uncommitted share-route edit) | Shared HTML served inline on the app origin. |
| 5.3.4 parameterised queries | Pass | `neon` tagged templates everywhere; the one dynamic clause (`listFor` projection) has no user input. |
| 5.3.5 escaping where no parameters | N/A | |
| 5.3.6 JSON injection | Pass | `JSON.parse`/`NextResponse.json` only. |
| 5.3.7 LDAP | N/A | |
| 5.3.8 OS command injection | Pass | No shell calls in the web app; desktop `--install-startup` writes a file with `process.execPath` (not user input); `openBrowser` spawns with an array argv (no shell interpolation of the URL on mac/linux; on Windows `cmd /c start "" <url>` with a server-generated URL). |
| 5.3.9 LFI/RFI | Pass | Demo blob paths come from the server's own ids. |
| 5.3.10 XPath/XML | N/A | |
| 5.5.1 serialized objects integrity | Pass | Only JSON; session state in httpOnly cookie is JSON with a nonce, read back and deleted. |
| 5.5.2 XML parsers | N/A | |
| 5.5.3 deserialisation of untrusted data | Pass | `JSON.parse` with `.catch` and shape checks. |
| 5.5.4 JSON.parse not eval | Pass | |

## V6 Stored Cryptography (1)

| Req | Verdict | Evidence |
| --- | --- | --- |
| 6.2.1 crypto fails securely | Pass | AES-GCM (authenticated); a failed tag check throws and the UI says "Couldn't open"; no padding oracle surface. |

## V7 Error Handling and Logging (3)

| Req | Verdict | Evidence |
| --- | --- | --- |
| 7.1.1 no credentials in logs | Pass | No `console.*` in routes; Vercel logs request lines only. |
| 7.1.2 no other sensitive data logged | Pass | Same. |
| 7.4.1 generic error message | **Partial** | Most errors are plain sentences; two routes return provider error text verbatim (THREAT-MODEL N-4). Unhandled exceptions give Next's generic 500. |

## V8 Data Protection (7)

| Req | Verdict | Evidence |
| --- | --- | --- |
| 8.2.1 anti-caching headers | **Partial** | Share downloads send `no-store`; API JSON responses rely on Next defaults (no explicit `Cache-Control: no-store` on `/api/me`, which carries the key). Add it. |
| 8.2.2 no sensitive data in browser storage | **Fail by the letter, accepted by design** | The file key lives in localStorage (both modes after unlock). Documented in the privacy page. |
| 8.2.3 cleared on sign-out | Pass | `clearRawKey`, `cacheClear`, done-sets removed (`Drive.tsx signOut`). Remembered account emails are kept on purpose for the chooser. |
| 8.3.1 sensitive data not in query strings | **Partial** | Share token in the URL (inherent to links). Device link poll puts `secret` in a query string (`GET /api/devices/link?id&secret`): move to a header or POST. |
| 8.3.2 export or delete on demand | Pass | Export everything (Settings); Start fresh deletes all files; file delete per item. |
| 8.3.3 clear language and consent | Pass | Privacy page states what is kept and why; Google consent at sign-in. |
| 8.3.4 sensitive data identified, policy exists | Pass | docs/RISK-ASSESSMENT.md section 1 is the inventory; privacy page is the policy. |

## V9 Communication (3)

| Req | Verdict | Evidence |
| --- | --- | --- |
| 9.1.1 TLS everywhere, no fallback | Pass | Vercel serves HTTPS; HSTS with the uncommitted headers. |
| 9.1.2 strong cipher suites | Pass (platform) | Vercel's TLS configuration; not tested with a scanner here. |
| 9.1.3 TLS 1.2/1.3 only | Pass (platform) | Same. |

## V10 Malicious Code (3)

| Req | Verdict | Evidence |
| --- | --- | --- |
| 10.3.1 signed auto-updates | N/A today, **Fail when shipped** | The desktop app has no auto-update yet; the installer is unsigned. electron-updater with a signed build is the standard answer. |
| 10.3.2 integrity of loaded code | Pass | No third-party scripts loaded at runtime; fonts self-hosted via next/font. |
| 10.3.3 subdomain takeover | **Partial** | `stash.olusanyatodd.com` is a CNAME to Vercel; a `staging.` CNAME is about to be added. Keep DNS records only for live Vercel projects; remove when a project is deleted. |

## V11 Business Logic (5)

| Req | Verdict | Evidence |
| --- | --- | --- |
| 11.1.1 steps in order | Pass | Link: start → approve → collect, enforced by state; uploads: pieces then register (register is the gate, though the ledger is client-supplied, 4.1.2). |
| 11.1.2 human-time limits | **Fail** | No pacing anywhere. |
| 11.1.3 per-user limits | **Fail** | No per-account upload or storage budget. |
| 11.1.4 anti-automation | **Fail** | No rate limiting on uploads, downloads, links. |
| 11.1.5 limits from threat modelling | **Partial** | This document and THREAT-MODEL.md exist; the limits they call for are not yet built. |

## V12 Files and Resources (11)

| Req | Verdict | Evidence |
| --- | --- | --- |
| 12.1.1 reject oversize files | **Partial** | Per request: 4 MB pieces enforced. Per file or per account: none (pieces are unlimited; 4 GB client-side cap only). |
| 12.3.1 filenames not used on the filesystem | Pass | Demo blobs stored by server id (`BLOB_DIR/<id>`); Telegram gets random names. |
| 12.3.2 LFI via filename | Pass | Same. |
| 12.3.3 RFI/SSRF via filename | Pass | File names never form URLs. |
| 12.3.4 reflective file download | Pass | `Content-Disposition` filename is the stored name, encoded with `filename*=UTF-8''`; API JSON has no user-controlled filename parameter. |
| 12.3.5 filename to OS APIs | Pass (web); Pass (desktop reads paths it discovered itself) | |
| 12.4.1 stored outside web root | Pass | Telegram / `.data/blobs` outside `public/`. |
| 12.4.2 antivirus scanning | **Fail by the letter, accepted** | Ciphertext cannot be scanned server-side; the design puts scanning on the device. Document. |
| 12.5.1 serve only allowed extensions | Pass | Next serves built assets only. |
| 12.5.2 uploads never executed as HTML/JS | **Fail** (Pass with the uncommitted share-route edit) | Inline share of an HTML upload. |
| 12.6.1 outbound allow list | Pass | Fixed hosts in code; no configurable outbound URLs. |

## V13 API and Web Service (6)

| Req | Verdict | Evidence |
| --- | --- | --- |
| 13.1.1 same parsers everywhere | Pass | Next.js request parsing throughout. |
| 13.1.3 no secrets in API URLs | **Partial** | Device link `secret` in a query string (see 8.3.1). |
| 13.2.1 methods appropriate | Pass | DELETE/PATCH/PUT only on owner-checked resources. |
| 13.2.2 JSON schema validation | **Partial** | Hand-written shape checks, no schema library. Adequate at this size. |
| 13.2.3 CSRF for cookie APIs | Pass | SameSite=Lax plus JSON/multipart bodies; no Origin check as a second layer. |
| 13.3.1 SOAP XSD | N/A | |

## V14 Configuration (15)

| Req | Verdict | Evidence |
| --- | --- | --- |
| 14.2.1 dependencies current, checked at build | **Partial** | `npm audit` 2026-11-08: web app 1 moderate at runtime (fflate zip64 loop, affects only parsing zips, which the app never does), 9 moderate in dev tooling; desktop 1 High (sharp/libvips), 6 moderate. No audit step in CI. |
| 14.2.2 unneeded features removed | **Partial** | Demo routes (`api/migrate`, `api/photos`) and the legacy `tokens` table remain in production. |
| 14.2.3 SRI for external assets | Pass | No external assets. |
| 14.3.2 debug off in production | Pass | `next build` production mode; `STASH_DEV_SIGNIN` dead on Vercel. |
| 14.3.3 no version disclosure | **Partial** | Vercel adds `x-powered-by: Next.js` unless `poweredByHeader: false`. Add it. |
| 14.4.1 Content-Type on every response | Pass | Next sets it; share downloads set it explicitly. |
| 14.4.2 Content-Disposition on API responses | **Fail** | JSON API responses have no `Content-Disposition: attachment`. Low value with `nosniff`, but it is the requirement. |
| 14.4.3 CSP | **Fail** (Pass with the uncommitted `next.config.ts`) | None today. |
| 14.4.4 nosniff | **Fail** (Pass with the uncommitted headers) | |
| 14.4.5 HSTS | **Partial** (Pass with the uncommitted headers) | Vercel sends HSTS for its own domains; custom-domain behaviour not verified. |
| 14.4.6 Referrer-Policy | **Fail** (Pass with the uncommitted headers) | |
| 14.4.7 frame-ancestors / X-Frame-Options | **Fail** (Pass with the uncommitted headers) | |
| 14.5.1 only used HTTP methods | Pass | Unhandled methods get 405 from Next. |
| 14.5.2 Origin not used for auth | Pass | Not used. |
| 14.5.3 CORS allow list | Pass | No CORS headers at all: cross-origin reads are refused by default. |

## Scanner results (2026-11-08)

| Tool | Scope | Result |
| --- | --- | --- |
| `npm audit --omit=dev` | web app | 1 moderate: fflate `unzipSync` infinite loop on malformed ZIP64 (GHSA-px8p-9vwx-vf98). Stash only writes zips; not reachable. Fix available. |
| `npm audit` | web app incl. dev tools | 9 moderate, all in build tooling. |
| `npm audit --omit=dev` | desktop app | 1 High: sharp 0.34 bundles libvips with CVE-2026-33327/33328/35590/35591. Reachable: thumbnails from watched folders. Optional dependency; upgrade when a fixed sharp ships, or drop desktop previews until then. |
| grep for dangerous sinks | both | No `eval`, no `dangerouslySetInnerHTML`; one `innerHTML` in `showLoading` with static markup and `textContent` for the name (safe); desktop UI builds HTML with `esc()` on every dynamic value (checked). |
| Static analysis (semgrep) | | Not run: no Python on this machine. Worth adding to CI with the `p/owasp-top-ten` ruleset. |

## What the two methods disagree on

The judgement pass rated the shared Telegram bot (D-1) Critical and the egress habit (D-2) Critical; ASVS L1 has no item for either (they are availability and cost, which ASVS treats under 11.1.3/11.1.4 only generically). Conversely ASVS flags things the judgement pass skipped as unimportant: `__Host-` cookie prefix, `Content-Disposition` on JSON, `x-powered-by`, the passcode hint, the link secret in a query string. Both lists are right about different things; the fix order in docs/RISK-ASSESSMENT.md section 5 still stands, with the ASVS items folded in as cheap extras.

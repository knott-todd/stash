# Staging: a live site only we see

Rule (2026-11-08): production gets only what is finished for a non-technical
person. Everything else lands on staging first, where Olusanya tries it from a
real URL.

## How it works

- Branch `staging` on GitHub. Vercel builds every branch as a Preview
  deployment; `main` is Production.
- The build reads `NEXT_PUBLIC_STASH_STAGE`. On Preview it is `staging`, which
  shows unfinished features (Stash Desktop setup, a "Staging" badge in the
  header). On Production it is unset, and those parts are hidden or replaced
  with "on its way" copy.
- Work flows: feature branch or `staging` → try it on staging → merge to `main`.

## One-time setup (Olusanya; I cannot do these from here)

1. **Vercel → Project → Settings → Domains → Add** `staging.stash.olusanyatodd.com`
   and assign it to the `staging` branch (the "Git branch" field on the domain).
2. **Porkbun DNS:** CNAME `staging.stash` → `cname.vercel-dns.com`.
3. **Vercel → Settings → Environment Variables**, scope **Preview** only:
   - `NEXT_PUBLIC_STASH_STAGE` = `staging`
   - `DATABASE_URL` = a **separate Neon project** named `stash-staging` (the free
     plan allows 100 projects; it refused a branch and a database inside the
     existing one). Its own compute hours and 5 GB transfer, so staging can never
     take production down. Tables are created on first use.
   - `STASH_STORAGE_CHAT_ID`: optional separate chat so staging uploads are
     easy to purge; the same bot works. Everything else (Google, Telegram token)
     can be copied from Production.
4. **Google Cloud Console → OAuth client → Authorized redirect URIs:** add
   `https://staging.stash.olusanyatodd.com/api/google/callback`.
5. Push to `staging`. The first deploy appears at the preview URL and, once
   DNS resolves, at the subdomain.

After that, nothing needs you: I push unfinished work to `staging`, you try it,
and only what you approve is merged to `main`.

## Moving another drive runs on the server

Standard accounts move Google Drive (and Dropbox/OneDrive) without a tab open:
`/api/copy/run` does about four minutes of copying, then calls itself for the
next run. Passcode accounts still copy in the browser (Stash can't encrypt for
them). For the chain to work on a deployment:

- **CRON_SECRET** must be set (Production and Preview): the runs authenticate
  to each other with it. Without it the copy starts and stops after one run.
- **Staging only:** Preview deployments sit behind Vercel's login, which also
  blocks the server calling itself. Turn on **Vercel → Settings → Deployment
  Protection → Protection Bypass for Automation**; Vercel then provides
  `VERCEL_AUTOMATION_BYPASS_SECRET` and the runs send it.
- Watchdogs restart a chain that died: any Stash page load, the daily cron,
  and `.github/workflows/copy-watchdog.yml` every 30 minutes (needs repository
  secrets `CRON_SECRET`, and `VERCEL_BYPASS` for staging).

## Housekeeping cron

`vercel.json` runs `/api/cron/sweep` daily at 04:00 UTC (unregistered uploads, idle sessions, stale link codes, old rate-limit windows). Vercel sends `Authorization: Bearer $CRON_SECRET`; set **CRON_SECRET** (any long random string) in Vercel for Production and Preview, or the route answers 404 there.

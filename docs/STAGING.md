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
   - `DATABASE_URL` = a separate **database** in the same Neon project (the free
     plan refuses a new branch: "quota exceeded"): Neon console → project
     `broad-hall-47002201` → Databases → New database named `staging` → copy its
     pooled connection string. Tables are created on first use. Staging shares the
     project's compute and 5 GB egress with production, so no bulk copies on staging.
   - `STASH_STORAGE_CHAT_ID`: optional separate chat so staging uploads are
     easy to purge; the same bot works. Everything else (Google, Telegram token)
     can be copied from Production.
4. **Google Cloud Console → OAuth client → Authorized redirect URIs:** add
   `https://staging.stash.olusanyatodd.com/api/google/callback`.
5. Push to `staging`. The first deploy appears at the preview URL and, once
   DNS resolves, at the subdomain.

After that, nothing needs you: I push unfinished work to `staging`, you try it,
and only what you approve is merged to `main`.

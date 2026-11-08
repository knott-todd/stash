// Which site this build is. Production shows only what is finished for a
// non-technical person; staging shows everything, so unfinished features can be
// tried on a live URL that users never see. Set NEXT_PUBLIC_STASH_STAGE=staging
// on the Vercel Preview environment (the `staging` branch); leave it unset on
// Production.
export const STAGE = process.env.NEXT_PUBLIC_STASH_STAGE ?? "production";
export const STAGING = STAGE !== "production";

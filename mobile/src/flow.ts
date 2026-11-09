// Where the app goes next. One place decides, so the carousel, the three steps and the
// "I already have an account" path all land on the first unfinished item and never
// repeat a finished one. (Spec: docs/phone/01-onboarding-and-setup.md, "Back and returning".)

import { me, type Config } from "./api";
import { importKey } from "./crypto";

export type Route = "Carousel" | "Steps" | "Decide" | "EnterPasscode" | "YouAreIn" | "Home";
export type Step = 1 | 2 | 3;
// The three steps live on one screen (the accordion); `step` says which one is open.
export type Dest = { name: Route; params?: { step: Step; from?: Step } };

export type Who = Awaited<ReturnType<typeof me>>;

// The screen to show for this account, given what is already done. `existing` is the
// "I already have an account" path: no Move step, straight to backing up this phone.
// `from` is the step just finished, so the Steps screen can collapse it as it opens the next.
export async function nextRoute(c: Config, who: Who | null, existing: boolean, from?: Step): Promise<Dest> {
  if (!c.token) return c.setup?.seenCarousel ? { name: "Steps", params: { step: 1 } } : { name: "Carousel" };
  const w = who ?? (await me(c));
  if (!w.protection) return { name: "Decide" };
  if (w.protection === "passcode") {
    let ok = false;
    if (c.key) {
      try {
        await importKey(c.key);
        ok = true;
      } catch {}
    }
    if (!ok) return { name: "EnterPasscode" };
  }
  const movedSomething = !!w.googleConnected || (w.fileCount ?? 0) > 0;
  if (!existing && !c.setup?.moved && !movedSomething) return { name: "Steps", params: { step: 2, from } };
  if (!c.setup?.backup) return { name: "Steps", params: { step: 3, from } };
  return { name: "Home" };
}

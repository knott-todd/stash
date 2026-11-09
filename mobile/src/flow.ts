// Where the app goes next. One place decides, so the carousel, the three steps and the
// "I already have an account" path all land on the first unfinished item and never
// repeat a finished one. (Spec: docs/phone/01-onboarding-and-setup.md, "Back and returning".)

import { me, type Config } from "./api";
import { importKey } from "./crypto";

export type Route = "Carousel" | "SignIn" | "Decide" | "EnterPasscode" | "MoveFiles" | "BackupPhone" | "YouAreIn" | "Drive";

export type Who = Awaited<ReturnType<typeof me>>;

// The screen to show for this account, given what is already done. `existing` is the
// "I already have an account" path: no Move step, straight to backing up this phone.
export async function nextRoute(c: Config, who: Who | null, existing: boolean): Promise<Route> {
  if (!c.token) return c.setup?.seenCarousel ? "Carousel" : "Carousel";
  const w = who ?? (await me(c));
  if (!w.protection) return "Decide";
  if (w.protection === "passcode") {
    let ok = false;
    if (c.key) {
      try {
        await importKey(c.key);
        ok = true;
      } catch {}
    }
    if (!ok) return "EnterPasscode";
  }
  const movedSomething = !!w.googleConnected || (w.fileCount ?? 0) > 0;
  if (!existing && !c.setup?.moved && !movedSomething) return "MoveFiles";
  if (!c.setup?.backup) return "BackupPhone";
  return "Drive";
}

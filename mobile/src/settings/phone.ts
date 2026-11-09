// This phone's backup, as the Devices page shows it: whether Stash may see the photos, what
// the camera roll holds and what is still to send, why it is waiting, and the controls
// (the three rules, Check now, Start backing up). Read from the phone itself, so it shows
// before the network answers. (docs/phone/04-devices-and-settings.md, "This phone's card")

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as MediaLibrary from "expo-media-library";
import { me, settingsOf, type Settings } from "../api";
import { census, runBackup, scheduleBackground, type Progress } from "../backup";
import { backupNews } from "../events";
import { useSession } from "../session";

export type Perm = "granted" | "limited" | "denied" | "undetermined";
export type PhoneBackup = {
  on: boolean; // the person switched backup on (setup step 3, or here)
  perm: Perm | null;
  canAsk: boolean;
  count: Progress | null; // what the camera roll holds and what is still to send
  sending: boolean;
  progress: Progress | null; // this screen's own run, when Check now is pressed
  locked: boolean; // a Locked account this phone has no passcode for yet
  error: string | null;
};

let running = false; // one run at a time, whoever starts it

async function permission(): Promise<{ perm: Perm; canAsk: boolean }> {
  const p = await MediaLibrary.getPermissionsAsync(false, ["photo", "video"]);
  const perm: Perm = p.granted ? (p.accessPrivileges === "limited" ? "limited" : "granted") : p.status === "undetermined" ? "undetermined" : "denied";
  return { perm, canAsk: p.canAskAgain };
}

export function usePhoneBackup() {
  const { cfg, update } = useSession();
  const [st, setSt] = useState<PhoneBackup>({ on: cfg?.setup?.backup === true, perm: null, canAsk: true, count: null, sending: backupNews.get().sending, progress: null, locked: false, error: null });
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const patch = useCallback((p: Partial<PhoneBackup>) => live.current && setSt((x) => ({ ...x, ...p })), []);

  // Recount: permission, then the camera roll against what is already sent.
  const recount = useCallback(async () => {
    if (!cfg) return;
    try {
      const p = await permission();
      patch(p);
      if (p.perm === "granted" || p.perm === "limited") patch({ count: await census(cfg) });
    } catch {
      // A count that fails leaves the last one showing; the card stays useful.
    }
  }, [cfg, patch]);

  useEffect(() => {
    patch({ on: cfg?.setup?.backup === true });
  }, [cfg?.setup?.backup, patch]);

  useEffect(() => {
    recount();
  }, [recount]);

  // Locked accounts: the phone needs the passcode once before it can send anything.
  useEffect(() => {
    if (!cfg?.token) return;
    me(cfg)
      .then((w) => patch({ locked: w.protection === "passcode" && !w.key && !cfg.key }))
      .catch(() => {});
  }, [cfg, patch]);

  // Someone else's run (the background task, setup) finishing changes the count.
  useEffect(
    () =>
      backupNews.on((n) => {
        patch({ sending: n.sending });
        if (!n.sending) recount();
      }),
    [patch, recount],
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (a) => a === "active" && recount());
    return () => sub.remove();
  }, [recount]);

  // Check now: send what is waiting, ignoring the Wi-Fi and charging rules.
  const checkNow = useCallback(async () => {
    if (!cfg || running) return;
    running = true;
    patch({ error: null, progress: null });
    try {
      const p = await runBackup((x) => patch({ progress: { ...x } }), 10 * 60 * 1000, true);
      patch({ progress: null, count: { ...p, waitingFor: null } });
      if (p.failed) patch({ error: p.failed === 1 ? "1 photo couldn’t be sent. Check now tries it again." : `${p.failed.toLocaleString()} photos couldn’t be sent. Check now tries them again.` });
    } catch (e) {
      const m = String((e as Error).message);
      if (m === "locked") patch({ locked: true });
      else if (m === "no-permission") patch({ perm: "denied" });
      else patch({ error: "Couldn’t reach Stash. Check your connection and try again." });
      patch({ progress: null });
    } finally {
      running = false;
      recount();
    }
  }, [cfg, patch, recount]);

  // Allow photos: ask, or send the person to the phone's settings when it can no longer ask.
  const allow = useCallback(async () => {
    const p = await MediaLibrary.requestPermissionsAsync(false, ["photo", "video"]);
    await recount();
    return p.granted;
  }, [recount]);

  // Start backing up (when it was left for later): the permission, the schedule, a first run.
  const start = useCallback(async () => {
    if (!(await allow())) return;
    await update((c) => ({ ...c, setup: { ...(c.setup ?? {}), backup: true } }));
    await scheduleBackground().catch(() => {});
    patch({ on: true });
    if (!running) {
      running = true;
      runBackup(() => {}, 10 * 60 * 1000)
        .catch(() => {})
        .finally(() => {
          running = false;
          recount();
        });
    }
  }, [allow, update, patch, recount]);

  // The rules are saved the moment they change, and the waiting count follows.
  const setRule = useCallback(
    async (k: keyof Settings, v: boolean) => {
      const next = await update((c) => ({ ...c, settings: { ...settingsOf(c), [k]: v } }));
      try {
        const p = await permission();
        if (p.perm === "granted" || p.perm === "limited") patch({ count: await census(next) });
      } catch {}
    },
    [update, patch],
  );

  return { ...st, settings: cfg ? settingsOf(cfg) : null, lastRun: cfg?.lastRun ?? null, recount, checkNow, allow, start, setRule, unlocked: () => patch({ locked: false }) };
}

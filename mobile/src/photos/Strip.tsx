// The one line under the Photos title while something on this phone waits to back up
// (docs/phone/03-photos.md, "Backup strip"): why it waits (Wi-Fi, charging, both), how many are
// left while it sends, the failures with Try again, and a short "Everything on this phone is
// safe" when it finishes. Offline, the line says so instead.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useFocusEffect } from "@react-navigation/native";
import * as Battery from "expo-battery";
import * as Network from "expo-network";
import { font, ink, ink2, line } from "../ui";
import { loadConfig, settingsOf, type Config } from "../api";
import { holdReason, runBackup, type Progress } from "../backup";
import { backupNews } from "../events";
import * as drive from "../drive/store";
import { noun, readDone } from "./model";

type Hold = "wifi" | "charging" | "both" | null;

// holdReason names the first rule that stops it; the strip also wants to know when both do.
async function holds(c: Config): Promise<Hold> {
  const r = await holdReason(c);
  if (r !== "wifi" || !settingsOf(c).chargingOnly) return r;
  const b = await Battery.getBatteryStateAsync().catch(() => Battery.BatteryState.UNKNOWN);
  return b === Battery.BatteryState.UNPLUGGED ? "both" : "wifi";
}

let running = false; // one foreground run at a time, across screens

export function BackupStrip({ cfg, on, pending, kinds, offline, onOpen }: { cfg: Config | null; on: boolean; pending: number; kinds: { photos: number; videos: number }; offline: boolean; onOpen: () => void }) {
  const [sending, setSending] = useState(backupNews.get().sending);
  const [run, setRun] = useState<Progress | null>(null);
  const [hold, setHold] = useState<Hold>(null);
  const [failed, setFailed] = useState(0);
  const [flash, setFlash] = useState(false);
  const runStart = useRef(0);
  const autoTried = useRef(false);
  const wasSending = useRef(false);

  useEffect(() => backupNews.on((n) => setSending(n.sending)), []);

  const recheck = useCallback(() => {
    if (!cfg) return;
    holds(cfg).then(setHold).catch(() => {});
    loadConfig()
      .then((c) => setFailed(c.lastRun?.failed ?? 0))
      .catch(() => {});
  }, [cfg]);
  useFocusEffect(
    useCallback(() => {
      recheck();
      const t = setInterval(recheck, 20_000);
      const net = Network.addNetworkStateListener(recheck);
      const bat = Battery.addBatteryStateListener(recheck);
      const app = AppState.addEventListener("change", (s) => s === "active" && recheck());
      return () => {
        clearInterval(t);
        net.remove();
        bat.remove();
        app.remove();
      };
    }, [recheck]),
  );

  const start = useCallback(
    (force: boolean) => {
      if (running || !cfg) return;
      running = true;
      runStart.current = 0;
      setFailed(0);
      runBackup(
        (p) => {
          if (!runStart.current) runStart.current = p.pending;
          setRun({ ...p });
        },
        60 * 60 * 1000,
        force,
      )
        .then((p) => setFailed(p.failed))
        .catch((e) => {
          const m = String((e as Error).message);
          drive.toast(m === "locked" ? "Open Stash with your passcode to back up." : m === "no-permission" ? "Stash needs access to your photos to back them up." : "Couldn't back up just now. Check your connection.");
        })
        .finally(() => {
          running = false;
          setRun(null);
          readDone();
          drive.check();
          recheck();
        });
    },
    [cfg, recheck],
  );

  // It runs itself: when the rules allow and nothing is sending, start from here.
  useEffect(() => {
    if (!(on && !offline && pending > 0 && hold === null && !sending && !run && !autoTried.current && cfg)) return;
    // A moment first, so a run another screen or the background just began has said it is sending.
    const t = setTimeout(() => {
      if (backupNews.get().sending || running) return;
      autoTried.current = true;
      start(false);
    }, 5000);
    return () => clearTimeout(t);
  }, [on, offline, pending, hold, sending, run, cfg, start]);

  const busy = sending || !!run;
  // Finishing with nothing left: say so for three seconds. The count settles a moment after the
  // run ends (the list and the sent set reload), so the finish is remembered for a few seconds.
  const [justFinished, setJustFinished] = useState(false);
  useEffect(() => {
    if (wasSending.current && !busy) {
      setJustFinished(true);
      setTimeout(() => setJustFinished(false), 6000);
    }
    wasSending.current = busy;
  }, [busy]);
  useEffect(() => {
    if (justFinished && pending === 0 && failed === 0) {
      setJustFinished(false);
      setFlash(true);
      setTimeout(() => setFlash(false), 3000);
    }
  }, [justFinished, pending, failed]);

  let text: string | null = null;
  let action: { label: string; run: () => void } | null = null;
  let progress: number | null = null;
  if (offline) text = "You're offline. Showing what this phone already has.";
  else if (!on) text = null;
  else if (busy) {
    const left = run ? run.pending : pending;
    text = `Backing up · ${left.toLocaleString()} to go`;
    progress = run && runStart.current ? Math.max(0.03, 1 - run.pending / runStart.current) : 0.03;
  } else if (failed > 0 && pending > 0) {
    text = `${failed.toLocaleString()} ${noun(failed, kinds)} couldn't be backed up`;
    action = { label: "Try again", run: () => start(true) };
  } else if (pending > 0 && hold) {
    const n = `${pending.toLocaleString()} ${noun(pending, kinds)}`;
    text = hold === "wifi" ? `${n} will back up when you're on Wi-Fi` : hold === "charging" ? `${n} will back up when you next charge` : `${n} will back up when you next charge on Wi-Fi`;
    action = { label: "Back up now", run: () => start(true) };
  } else if (flash) text = "Everything on this phone is safe";

  if (!text) return null;
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)}>
      <Pressable onPress={offline ? undefined : onOpen} style={s.strip} accessibilityRole="button" accessibilityLiveRegion="polite">
        <Text style={s.text} numberOfLines={2}>
          {text}
        </Text>
        {action && (
          <Pressable hitSlop={10} onPress={action.run} accessibilityRole="button">
            <Text style={s.action}>{action.label}</Text>
          </Pressable>
        )}
      </Pressable>
      {progress !== null && (
        <View style={s.bar}>
          <View style={[s.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  strip: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 10 },
  text: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: font.regular, color: ink2 },
  action: { fontSize: 15, fontFamily: font.medium, color: ink, textDecorationLine: "underline" },
  bar: { height: 2, marginHorizontal: 20, marginBottom: 8, backgroundColor: line, overflow: "hidden", borderRadius: 1 },
  fill: { height: 2, backgroundColor: ink },
});

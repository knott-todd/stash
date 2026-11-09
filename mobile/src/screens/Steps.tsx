// "Switch to Stash in 3 easy steps", as one screen. The three steps are stacked titles; the
// one you are on is open, with its line and its button under it. Finishing a step collapses
// it into a small, struck-through line and opens the next, so the black moves down the list.
// (docs/phone/01-onboarding-and-setup.md, "Step screens, revised 2026-11-08".)

import React, { useEffect, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, Switch, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Device from "expo-device";
import * as MediaLibrary from "expo-media-library";
import { GoogleSignin, isErrorWithCode, statusCodes } from "@react-native-google-signin/google-signin";
import { Brand, Button, ErrorLine, faint, font, ink, ink3, line, P, Screen } from "../ui";
import { useSession } from "../session";
import { DEFAULT_SETTINGS, me, settingsOf, signInWithGoogle, type Settings } from "../api";
import { connectGoogleDrive, isGoogleConnected, runDriveCopy, type CopyState } from "../drivecopy";
import { runBackup, scheduleBackground } from "../backup";
import { nextRoute, type Dest, type Step } from "../flow";

type Nav = NativeStackNavigationProp<Record<string, { step?: Step; from?: Step; notice?: string } | undefined>>;
const STEPS: Record<Step, string> = { 1: "Sign in with Google", 2: "Move my files here", 3: "Back up this phone" };
const ease = LinearTransition.duration(380);

export function StepsScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<Record<string, { step?: Step; from?: Step; notice?: string } | undefined>, string>>();
  const { existing } = useSession();
  const target = params?.step ?? 1;
  // Arriving from a finished step (through the sign-in or passcode screens): show it open for a
  // beat, then collapse it into the next, the same motion as finishing a step in place.
  const [open, setOpen] = useState<Step>(params?.from ?? target);
  useEffect(() => {
    if (open === target) return;
    const t = setTimeout(() => setOpen(target), 450);
    return () => clearTimeout(t);
  }, [open, target]);

  // A returning account has no Move step and no numerals: sign in, then back up this phone.
  const steps: Step[] = existing ? [1, 3] : [1, 2, 3];

  async function go(d: Dest) {
    if (d.name === "Steps" && d.params) {
      nav.setParams({ step: d.params.step, from: undefined, notice: undefined });
      setOpen(d.params.step);
    } else nav.reset({ index: 0, routes: [{ name: d.name, params: d.params }] });
  }

  return (
    <Screen top={<Brand />}>
      {!!params?.notice && (
        <Animated.Text entering={FadeIn.duration(220)} style={s.notice} accessibilityLiveRegion="polite">
          {params.notice}
        </Animated.Text>
      )}
      {existing && <Text style={s.eyebrow}>Two steps for this phone</Text>}
      {steps.map((n) => {
        const state = n === open ? "now" : n < open ? "done" : "next";
        return (
          <Animated.View key={n} layout={ease} style={state === "now" ? s.sectionNow : s.section}>
            <Animated.Text key={state} entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={state === "now" ? s.titleNow : [s.titleOther, state === "done" && s.titleDone]} accessibilityRole="header">
              {existing ? "" : `${n}. `}
              {STEPS[n]}
            </Animated.Text>
            {state === "now" && (
              <Animated.View entering={FadeIn.duration(260).delay(120)} exiting={FadeOut.duration(120)} layout={ease} style={{ flex: 1 }}>
                {n === 1 && <SignInBody go={go} />}
                {n === 2 && <MoveFilesBody go={go} />}
                {n === 3 && <BackupBody go={go} />}
              </Animated.View>
            )}
          </Animated.View>
        );
      })}
    </Screen>
  );
}

type BodyProps = { go: (d: Dest) => Promise<void> };

// A step's body fills its section: the line under the title, the actions at the foot.
function Fill({ children, actions }: { children: React.ReactNode; actions: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      {children}
      <View style={{ flex: 1, minHeight: 28 }} />
      {actions}
    </View>
  );
}

// Step 1: sign in with Google, through the phone's own account picker.
function SignInBody({ go }: BodyProps) {
  const { cfg, update, existing } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState<string | null>(null);

  async function signIn() {
    if (!cfg || busy) return;
    setBusy(true);
    setError(null);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      if (res.type !== "success" || !res.data.idToken) return;
      const who = await signInWithGoogle(cfg.server, res.data.idToken, `${Device.deviceName ?? "Phone"}`);
      const next = await update({ token: who.token, deviceId: who.deviceId, email: who.email, pendingLink: undefined });
      const w = await me(next);
      if (existing && !w.protection) {
        // They said they had an account, but this one is new: say so, then the decision.
        setNewAccount(who.email ?? "that account");
        return;
      }
      await go(await nextRoute(next, w, existing, 1));
    } catch (e) {
      if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return;
      setError(isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE ? "This phone needs Google Play services to sign in." : String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  if (newAccount)
    return (
      <Fill actions={<Button title="Let’s make one" onPress={() => go({ name: "Decide" })} />}>
        <P>There’s no Stash account for {newAccount} yet. Let’s make one.</P>
      </Fill>
    );
  return (
    <Fill
      actions={
        <>
          <ErrorLine text={error} />
          <Button title="Continue with Google" onPress={signIn} busy={busy} />
        </>
      }
    >
      <P>No password to make. Your Google account is enough.</P>
    </Fill>
  );
}

// Step 2: move my files here.
function MoveFilesBody({ go }: BodyProps) {
  const { cfg, update, existing } = useSession();
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState<CopyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  // Resume a copy that was interrupted, as the web does.
  useEffect(() => {
    if (!cfg) return;
    isGoogleConnected(cfg)
      .then((on) => on && !copy && start())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      stop.current = st !== "active"; // Android may stop us anyway; nothing is lost, it resumes next open
    });
    return () => sub.remove();
  }, []);

  function start() {
    runDriveCopy(setCopy, () => stop.current).catch((e) => setError(String((e as Error).message)));
  }
  async function connect() {
    if (!cfg || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await connectGoogleDrive(cfg);
      if (r === "ok") start();
      else if (r === "denied") setError("Google Drive didn’t allow access. Try again, or skip this for now.");
      else if (r !== "cancelled") setError("Couldn’t connect to Google Drive. Try again.");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function next(skipped: boolean) {
    const n = await update((c) => ({ ...c, setup: { ...(c.setup ?? {}), moved: skipped ? c.setup?.moved : true } }));
    await go(await nextRoute({ ...n, setup: { ...(n.setup ?? {}), moved: true } }, null, existing, 2));
  }

  const running = copy && (copy.phase === "scanning" || copy.phase === "copying");
  return (
    <Fill
      actions={
        <>
          <ErrorLine text={error} />
          {copy ? <Button title="Continue" onPress={() => next(false)} /> : <Button title="Connect Google Drive" onPress={connect} busy={busy} />}
          {!copy && <Button title="I don’t use Google Drive" kind="text" onPress={() => next(true)} />}
        </>
      }
    >
      {!copy && <P>Everything from Google Drive, folders included. Nothing is deleted there.</P>}
      {copy?.phase === "scanning" && <P>Looking through your Google Drive…</P>}
      {copy && copy.phase !== "scanning" && (
        <View>
          <P>
            {copy.phase === "done" ? `Everything is in Stash: ${copy.total.toLocaleString()} files.` : copy.phase === "paused" ? "Paused. Nothing is lost. Open Stash to carry on." : `Copying ${(copy.copied + copy.failed).toLocaleString()} of ${copy.total.toLocaleString()} files`}
          </P>
          <View style={s.bar}>
            <View style={[s.fill, { width: `${copy.total ? Math.round(((copy.copied + copy.failed) / copy.total) * 100) : 0}%` }]} />
          </View>
          {copy.current && <P small>{copy.current}</P>}
          {running && <P small>Keep Stash open while it copies. You can carry on to the next step; the copy continues behind it.</P>}
        </View>
      )}
    </Fill>
  );
}

// Step 3: back up this phone.
function BackupBody({ go }: BodyProps) {
  const { cfg, update, existing } = useSession();
  const [set, setSet] = useState<Settings>(cfg ? settingsOf(cfg) : DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState<"denied" | "partial" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = (k: keyof Settings) => (v: boolean) => setSet((x) => ({ ...x, [k]: v }));

  async function start() {
    if (!cfg || busy) return;
    setBusy(true);
    setError(null);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(false, ["photo", "video"]);
      if (!perm.granted) return setDenied("denied");
      if (perm.accessPrivileges === "limited") setDenied("partial");
      await update((c) => ({ ...c, settings: set, setup: { ...(c.setup ?? {}), backup: true } }));
      await scheduleBackground();
      runBackup(() => {}, 10 * 60 * 1000).catch(() => {});
      await go({ name: existing ? "Drive" : "YouAreIn" });
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function later() {
    await update((c) => ({ ...c, setup: { ...(c.setup ?? {}), backup: "later" } }));
    await go({ name: existing ? "Drive" : "YouAreIn" });
  }

  return (
    <Fill
      actions={
        <>
          <ErrorLine text={error} />
          {denied === "denied" ? (
            <>
              <P>Stash needs access to your photos to keep them safe.</P>
              <Button title="Open settings" onPress={() => Linking.openSettings()} />
            </>
          ) : (
            <Button title="Start backing up" onPress={start} busy={busy} />
          )}
          <Button title="Not now" kind="text" onPress={later} />
        </>
      }
    >
      <P>Your photos and videos back up on their own. Nothing is deleted.</P>
      {denied === "partial" && <P small>Only the photos you picked will back up.</P>}
      <Row label="Only on Wi-Fi" note="Never uses mobile data." value={set.wifiOnly} onChange={toggle("wifiOnly")} />
      <Row label="Only while charging" note="The big first backup happens overnight, not in your pocket." value={set.chargingOnly} onChange={toggle("chargingOnly")} />
      <Row label="Include videos" note="Videos are large; off keeps only photos safe." value={set.videos} onChange={toggle("videos")} />
    </Fill>
  );
}

function Row({ label, note, value, onChange }: { label: string; note: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowNote}>{note}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: ink }} thumbColor="#fff" />
    </View>
  );
}

const s = StyleSheet.create({
  eyebrow: { fontSize: 14, fontFamily: font.regular, color: ink3, marginBottom: 6 },
  notice: { fontSize: 15, lineHeight: 21, fontFamily: font.medium, color: ink, marginBottom: 12 },
  section: { paddingVertical: 12 },
  sectionNow: { flex: 1, paddingTop: 12, paddingBottom: 36 },
  // The website's hero: semibold, line-height ~1.05, tracking -0.035em; the other steps at a quiet 22.
  titleNow: { fontSize: 42, lineHeight: 45, fontFamily: font.semibold, color: ink, letterSpacing: -0.035 * 42, marginBottom: 20 },
  titleOther: { fontSize: 22, lineHeight: 29, fontFamily: font.semibold, color: faint, letterSpacing: -0.025 * 22 },
  titleDone: { textDecorationLine: "line-through" },
  bar: { height: 6, borderRadius: 3, backgroundColor: line, overflow: "hidden", marginBottom: 10 },
  fill: { height: 6, backgroundColor: ink },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: line },
  rowLabel: { fontSize: 17, fontFamily: font.regular, color: ink },
  rowNote: { fontSize: 14, fontFamily: font.regular, color: ink3, marginTop: 2 },
});

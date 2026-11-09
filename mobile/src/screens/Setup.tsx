// Steps 2 and 3, and the "You're in" moment.
import React, { useEffect, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, Switch, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as MediaLibrary from "expo-media-library";
import { Brand, Button, ErrorLine, H1, ink, ink2, ink3, line, P, Screen, Segments } from "../ui";
import { useSession } from "../session";
import { DEFAULT_SETTINGS, me, settingsOf, type Settings } from "../api";
import { connectGoogleDrive, isGoogleConnected, runDriveCopy, type CopyState } from "../drivecopy";
import { census, runBackup, scheduleBackground } from "../backup";
import { nextRoute } from "../flow";

type Nav = NativeStackNavigationProp<Record<string, undefined>>;

// Step 2: Move my files here.
export function MoveFilesScreen() {
  const nav = useNavigation<Nav>();
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
    nav.reset({ index: 0, routes: [{ name: await nextRoute({ ...n, setup: { ...(n.setup ?? {}), moved: true } }, null, existing) }] });
  }

  const running = copy && (copy.phase === "scanning" || copy.phase === "copying");
  return (
    <Screen
      centered
      top={
        <>
          <Brand />
          <Segments step={2} />
        </>
      }
      bottom={
        <>
          <ErrorLine text={error} />
          {copy ? <Button title="Continue" onPress={() => next(false)} /> : <Button title="Connect Google Drive" onPress={connect} busy={busy} />}
          {!copy && <Button title="I don’t use Google Drive" kind="text" onPress={() => next(true)} />}
        </>
      }
    >
      <H1>2. Move my files here</H1>
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
    </Screen>
  );
}

// Step 3: Back up this phone.
export function BackupPhoneScreen() {
  const nav = useNavigation<Nav>();
  const { cfg, update, existing } = useSession();
  const [set, setSet] = useState<Settings>(cfg ? settingsOf(cfg) : DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState<"denied" | "partial" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = (k: keyof Settings) => (v: boolean) => setSet((x) => ({ ...x, [k]: v }));

  async function go() {
    if (!cfg || busy) return;
    setBusy(true);
    setError(null);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(false, ["photo", "video"]);
      if (!perm.granted) return setDenied("denied");
      if (perm.accessPrivileges === "limited") setDenied("partial");
      const n = await update((c) => ({ ...c, settings: set, setup: { ...(c.setup ?? {}), backup: true } }));
      await scheduleBackground();
      runBackup(() => {}, 10 * 60 * 1000).catch(() => {});
      nav.reset({ index: 0, routes: [{ name: existing ? "Drive" : "YouAreIn" }] });
      void n;
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function later() {
    await update((c) => ({ ...c, setup: { ...(c.setup ?? {}), backup: "later" } }));
    nav.reset({ index: 0, routes: [{ name: existing ? "Drive" : "YouAreIn" }] });
  }

  return (
    <Screen
      centered
      bottom={
        <>
          <ErrorLine text={error} />
          {denied === "denied" ? (
            <>
              <P>Stash needs access to your photos to keep them safe.</P>
              <Button title="Open settings" onPress={() => Linking.openSettings()} />
            </>
          ) : (
            <Button title="Back up this phone" onPress={go} busy={busy} />
          )}
          <Button title="Not now" kind="text" onPress={later} />
        </>
      }
      top={
        <>
          <Brand />
          {existing ? <Text style={s.eyebrow}>One step for this phone</Text> : <Segments step={3} />}
        </>
      }
    >
      <H1>{existing ? "" : "3. "}Back up this phone</H1>
      <P>Your photos and videos back up on their own. Nothing is deleted.</P>
      {denied === "partial" && <P small>Only the photos you picked will back up.</P>}
      <Row label="Only on Wi-Fi" note="Never uses mobile data." value={set.wifiOnly} onChange={toggle("wifiOnly")} />
      <Row label="Only while charging" note="The big first backup happens overnight, not in your pocket." value={set.chargingOnly} onChange={toggle("chargingOnly")} />
      <Row label="Include videos" note="Videos are large; off keeps only photos safe." value={set.videos} onChange={toggle("videos")} />
    </Screen>
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

// After the third step: the feeling the website gives.
export function YouAreInScreen() {
  const nav = useNavigation<Nav>();
  const { cfg } = useSession();
  const [facts, setFacts] = useState<{ locked: boolean; files: number; photos: number } | null>(null);
  useEffect(() => {
    if (!cfg) return;
    Promise.all([me(cfg), census(cfg).catch(() => null)]).then(([w, c]) => setFacts({ locked: w.protection === "passcode", files: w.fileCount ?? 0, photos: c?.pending ?? 0 })).catch(() => setFacts({ locked: false, files: 0, photos: 0 }));
  }, [cfg]);
  return (
    <Screen centered bottom={<Button title="Open my drive" onPress={() => nav.reset({ index: 0, routes: [{ name: "Drive" }] })} />}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text style={s.in}>You’re in.</Text>
        <Text style={s.fact}>3 steps.</Text>
        <Text style={s.fact}>{facts?.locked ? "1 passcode, only yours." : "0 passwords."}</Text>
        <Text style={s.fact}>0 GB limit.</Text>
        {facts && (facts.files > 0 || facts.photos > 0) && (
          <P>
            {facts.files > 0 ? `${facts.files.toLocaleString()} files in your drive. ` : ""}
            {facts.photos > 0 ? `${facts.photos.toLocaleString()} photos will back up on Wi-Fi while charging.` : ""}
          </P>
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  bar: { height: 6, borderRadius: 3, backgroundColor: line, overflow: "hidden", marginBottom: 10 },
  fill: { height: 6, backgroundColor: ink },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: line },
  rowLabel: { fontSize: 16, color: ink },
  rowNote: { fontSize: 13, color: ink3, marginTop: 2 },
  eyebrow: { fontSize: 13, color: ink3, marginBottom: 10 },
  in: { fontSize: 48, fontWeight: "700", color: ink, letterSpacing: -1, marginBottom: 18 },
  fact: { fontSize: 30, fontWeight: "600", color: ink2, marginBottom: 6 },
});

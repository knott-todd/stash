// Stash for phones. One promise, kept quietly: every photo you take is safe.
// Screens: Welcome (Continue with Google) → Passcode (Locked accounts only) →
// Allow photos → Home (am I safe?) with Settings behind one link.

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Image, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as MediaLibrary from "expo-media-library";
import * as Device from "expo-device";
import { DEFAULT_SETTINGS, loadConfig, me, pollLink, saveConfig, settingsOf, signInSheet, startLink, unlinkSelf, type Config, type Settings } from "./src/api";
import { importKey, unwrapKey } from "./src/crypto";
import { census, runBackup, scheduleBackground, type Progress } from "./src/backup";

type Screen = "loading" | "welcome" | "passcode" | "allow" | "home" | "settings";

export default function App() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [hint, setHint] = useState<string | undefined>();
  const [passcode, setPasscode] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [recent, setRecent] = useState<MediaLibrary.Asset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"signin" | "open" | "backup" | null>(null);

  useEffect(() => {
    (async () => {
      const c = await loadConfig();
      setCfg(c);
      if (!c.token) return setScreen("welcome");
      await afterLink(c);
    })();
  }, []);

  // Coming back to the app: refresh the picture and send what is waiting.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && screen === "home" && cfg) start(cfg);
    });
    return () => sub.remove();
  }, [screen, cfg]);

  async function afterLink(c: Config) {
    try {
      const who = await me(c);
      if (c.key) {
        try {
          await importKey(c.key);
        } catch {
          c = { ...c, key: undefined };
          await saveConfig(c);
          setCfg(c);
        }
      }
      if (!who.key && who.keyWrapped && !c.key) {
        setHint(who.keyWrapped.hint);
        return setScreen("passcode");
      }
      const perm = await MediaLibrary.getPermissionsAsync(false, ["photo", "video"]);
      setScreen(perm.granted ? "home" : "allow");
      if (perm.granted) start(c);
    } catch {
      setScreen("welcome");
    }
  }

  // Continue with Google: the website signs the person in and links this phone in one tap.
  async function signIn() {
    if (busy) return;
    setBusy("signin");
    setError(null);
    const c = cfg ?? (await loadConfig());
    try {
      const l = await startLink(c.server, `${Device.deviceName ?? "Phone"}`);
      const pending = { linkId: l.linkId, secret: l.secret, code: l.code, url: l.url, expiresAt: Date.now() + l.expiresInSeconds * 1000 };
      await saveConfig({ ...c, pendingLink: pending });
      await signInSheet(c.server, l);
      // The sheet has closed; the approval is on the server if they said yes.
      for (let i = 0; i < 6; i++) {
        let s;
        try {
          s = await pollLink(c.server, l.linkId, l.secret);
        } catch {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        if (s.state === "approved") {
          const next = { ...c, token: s.token, deviceId: s.deviceId, email: s.email, pendingLink: undefined };
          await saveConfig(next);
          setCfg(next);
          return afterLink(next);
        }
        if (s.state !== "waiting") break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      setError("Sign-in didn't finish. Try again.");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function submitPasscode() {
    if (!cfg || busy) return;
    setBusy("open");
    setError(null);
    let raw: string | null = null;
    try {
      const who = await me(cfg);
      raw = who.keyWrapped ? await unwrapKey(who.keyWrapped, passcode) : null;
    } catch (e) {
      setError(String((e as Error).message));
      return;
    } finally {
      setBusy(null);
    }
    if (!raw) return setError("That passcode didn't open your files. Try again.");
    const next = { ...cfg, key: raw };
    await saveConfig(next);
    setCfg(next);
    setPasscode("");
    afterLink(next);
  }

  async function allow() {
    const perm = await MediaLibrary.requestPermissionsAsync(false, ["photo", "video"]);
    if (!perm.granted) return setError("Stash needs access to your photos to keep them safe.");
    setScreen("home");
    if (cfg) start(cfg);
  }

  const start = useCallback(async (c: Config, force = false) => {
    if (busy === "backup") return;
    setBusy("backup");
    setError(null);
    try {
      await scheduleBackground();
      setProgress(await census(c));
      setRecent((await MediaLibrary.getAssetsAsync({ mediaType: ["photo"], sortBy: [["creationTime", false]], first: 8 })).assets);
      await runBackup(setProgress, 10 * 60 * 1000, force);
      setCfg(await loadConfig());
    } catch (e) {
      const m = String((e as Error).message);
      if (m === "locked") setScreen("passcode");
      else if (m === "no-permission") setScreen("allow");
      else setError(m);
    } finally {
      setBusy(null);
    }
  }, [busy]);

  async function setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
    if (!cfg) return;
    const next = { ...cfg, settings: { ...settingsOf(cfg), [k]: v } };
    await saveConfig(next);
    setCfg(next);
  }

  function unlink() {
    Alert.alert("Unlink this phone?", "It stops backing up. Everything already sent stays in Stash.", [
      { text: "Keep linked", style: "cancel" },
      {
        text: "Unlink",
        style: "destructive",
        onPress: async () => {
          if (cfg) await unlinkSelf(cfg);
          const fresh: Config = { server: cfg?.server ?? (await loadConfig()).server };
          await saveConfig(fresh);
          setCfg(fresh);
          setProgress(null);
          setScreen("welcome");
        },
      },
    ]);
  }

  const settings = cfg ? settingsOf(cfg) : DEFAULT_SETTINGS;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.brand}>Stash.</Text>
        {screen === "loading" && <ActivityIndicator />}

        {screen === "welcome" && (
          <View>
            <Text style={s.h1}>Every photo you take, kept safe.</Text>
            <Text style={s.p}>Sign in once. From then on your photos and videos back up on their own, and they are there on any device you sign in to.</Text>
            <Pressable style={[s.btn, busy === "signin" && s.btnBusy]} onPress={signIn} disabled={!!busy}>
              {busy === "signin" ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Continue with Google</Text>}
            </Pressable>
          </View>
        )}

        {screen === "passcode" && (
          <View>
            <Text style={s.h1}>Your passcode</Text>
            <Text style={s.p}>Your files are locked with a passcode only you know. Enter it once on this phone.{hint ? ` Hint: ${hint}` : ""}</Text>
            <TextInput secureTextEntry value={passcode} onChangeText={setPasscode} placeholder="Passcode" style={s.input} autoFocus onSubmitEditing={submitPasscode} />
            <Pressable style={[s.btn, busy === "open" && s.btnBusy]} onPress={submitPasscode} disabled={!!busy}>
              {busy === "open" ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Open</Text>}
            </Pressable>
          </View>
        )}

        {screen === "allow" && (
          <View>
            <Text style={s.h1}>Allow photos</Text>
            <Text style={s.p}>Stash needs to see your photos and videos to keep them safe. Nothing else on the phone. Nothing is deleted.</Text>
            <Pressable style={s.btn} onPress={allow}>
              <Text style={s.btnText}>Allow access to photos</Text>
            </Pressable>
          </View>
        )}

        {screen === "home" && (
          <View>
            <Headline p={progress} busy={busy === "backup"} lastRun={cfg?.lastRun} />
            {recent.length > 0 && (
              <View style={s.strip}>
                {recent.map((a) => (
                  <Image key={a.id} source={{ uri: a.uri }} style={s.thumb} />
                ))}
              </View>
            )}
            <View style={s.row}>
              <Pressable style={s.linkBtn} onPress={() => cfg && start(cfg, true)} disabled={busy === "backup"}>
                <Text style={s.linkText}>{busy === "backup" ? "Checking…" : "Check now"}</Text>
              </Pressable>
              <Pressable style={s.linkBtn} onPress={() => cfg && Linking.openURL(`${cfg.server}/drive`).catch(() => {})}>
                <Text style={s.linkText}>Open Stash</Text>
              </Pressable>
              <Pressable style={s.linkBtn} onPress={() => setScreen("settings")}>
                <Text style={s.linkText}>Settings</Text>
              </Pressable>
            </View>
          </View>
        )}

        {screen === "settings" && (
          <View>
            <Pressable onPress={() => setScreen("home")}>
              <Text style={s.back}>‹ Back</Text>
            </Pressable>
            <Text style={s.h1}>Settings</Text>
            <Toggle label="Only on Wi-Fi" note="Never uses mobile data." value={settings.wifiOnly} onChange={(v) => setSetting("wifiOnly", v)} />
            <Toggle label="Only while charging" note="The big first backup happens overnight, not in your pocket." value={settings.chargingOnly} onChange={(v) => setSetting("chargingOnly", v)} />
            <Toggle label="Include videos" note="Videos are large; turn this off to keep only photos safe." value={settings.videos} onChange={(v) => setSetting("videos", v)} />
            <Text style={[s.small, { marginTop: 28 }]}>Linked as {cfg?.email ?? "your account"}</Text>
            <Pressable style={s.linkBtn} onPress={unlink}>
              <Text style={[s.linkText, { color: "#111" }]}>Unlink this phone</Text>
            </Pressable>
          </View>
        )}

        {error && <Text style={s.error}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

// The one line that answers "am I safe?", and the line under it that says when.
function Headline({ p, busy, lastRun }: { p: Progress | null; busy: boolean; lastRun?: Config["lastRun"] }) {
  if (!p) return <ActivityIndicator />;
  const when = lastRun?.at ? `Last checked ${ago(lastRun.at)}.` : "";
  if (p.pending === 0 && p.failed === 0)
    return (
      <View>
        <Text style={s.h1}>Your photos are safe.</Text>
        <Text style={s.p}>
          {p.total.toLocaleString()} {p.total === 1 ? "photo" : "photos and videos"} backed up. {when}
        </Text>
      </View>
    );
  if (p.current || (busy && !p.waitingFor))
    return (
      <View>
        <Text style={s.h1}>Backing up…</Text>
        <Text style={s.p}>
          {p.pending.toLocaleString()} to go{p.current ? ` · ${p.current}` : ""}
        </Text>
      </View>
    );
  if (p.waitingFor)
    return (
      <View>
        <Text style={s.h1}>{p.pending.toLocaleString()} waiting</Text>
        <Text style={s.p}>{p.waitingFor === "wifi" ? "They'll back up when you're on Wi-Fi." : "They'll back up next time you charge the phone."} Or tap Check now to send them right away.</Text>
      </View>
    );
  return (
    <View>
      <Text style={s.h1}>{p.pending.toLocaleString()} waiting</Text>
      <Text style={s.p}>
        {p.failed ? `${p.failed} couldn't be sent this time; they'll be tried again. ` : ""}
        {when}
      </Text>
    </View>
  );
}

function Toggle({ label, note, value, onChange }: { label: string; note: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggle}>
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text style={s.toggleLabel}>{label}</Text>
        <Text style={s.small}>{note}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: "#111" }} />
    </View>
  );
}

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#fafafa" },
  scroll: { padding: 24, paddingTop: 36 },
  brand: { fontSize: 22, fontWeight: "700", marginBottom: 32, color: "#111" },
  h1: { fontSize: 30, fontWeight: "600", color: "#111", marginBottom: 8, lineHeight: 36 },
  p: { fontSize: 16, color: "#6b6b6b", lineHeight: 22, marginBottom: 16 },
  small: { fontSize: 13, color: "#8a8a8a", marginTop: 2 },
  btn: { backgroundColor: "#111", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  btnBusy: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#e4e4e4", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, fontSize: 16, backgroundColor: "#fff", marginBottom: 12 },
  error: { color: "#111", marginTop: 16 },
  strip: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 8 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: "#eee" },
  row: { flexDirection: "row", gap: 20, marginTop: 16, flexWrap: "wrap" },
  linkBtn: { paddingVertical: 10 },
  linkText: { color: "#6b6b6b", fontSize: 15, textDecorationLine: "underline" },
  back: { color: "#6b6b6b", fontSize: 16, marginBottom: 16 },
  toggle: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#eee" },
  toggleLabel: { fontSize: 16, color: "#111" },
});

// Stash for phones: link once, allow photos once, then it backs up on its own.
// Three screens in one file: Link, Allow, Status.

import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import * as MediaLibrary from "expo-media-library";
import * as Device from "expo-device";
import { loadConfig, me, pollLink, saveConfig, startLink, type Config } from "./src/api";
import { unwrapKey } from "./src/crypto";
import { runBackup, scheduleBackground, type Progress } from "./src/backup";

type Screen = "loading" | "link" | "passcode" | "allow" | "status";

export default function App() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [code, setCode] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [hint, setHint] = useState<string | undefined>();
  const [passcode, setPasscode] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const c = await loadConfig();
      setCfg(c);
      if (!c.token) return setScreen("link");
      await afterLink(c);
    })();
  }, []);

  async function afterLink(c: Config) {
    try {
      const who = await me(c);
      if (!who.key && who.keyWrapped && !c.key) {
        setHint(who.keyWrapped.hint);
        return setScreen("passcode");
      }
      const perm = await MediaLibrary.getPermissionsAsync();
      setScreen(perm.granted ? "status" : "allow");
      if (perm.granted) start(c);
    } catch {
      setScreen("link");
    }
  }

  async function link() {
    setError(null);
    const c = cfg ?? (await loadConfig());
    try {
      const l = await startLink(c.server, `${Device.deviceName ?? "Phone"}`);
      setCode(l.code);
      setUrl(l.url);
      Linking.openURL(l.url).catch(() => {});
      const deadline = Date.now() + l.expiresInSeconds * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const s = await pollLink(c.server, l.linkId, l.secret);
        if (s.state === "approved") {
          const next = { ...c, token: s.token, deviceId: s.deviceId, email: s.email };
          await saveConfig(next);
          setCfg(next);
          return afterLink(next);
        }
        if (s.state !== "waiting") break;
      }
      setError("The code expired. Try again.");
      setCode(null);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  async function submitPasscode() {
    if (!cfg) return;
    const who = await me(cfg);
    const raw = who.keyWrapped ? await unwrapKey(who.keyWrapped, passcode) : null;
    if (!raw) return setError("That passcode didn't open the files.");
    const next = { ...cfg, key: raw };
    await saveConfig(next);
    setCfg(next);
    setError(null);
    afterLink(next);
  }

  async function allow() {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) return setError("Stash needs access to your photos to back them up.");
    setScreen("status");
    if (cfg) start(cfg);
  }

  async function start(c: Config) {
    try {
      await scheduleBackground();
      await runBackup(setProgress, 10 * 60 * 1000);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  return (
    <SafeAreaView style={s.page}>
      <Text style={s.brand}>Stash.</Text>
      {screen === "loading" && <ActivityIndicator />}

      {screen === "link" && (
        <View>
          <Text style={s.h1}>Link this phone</Text>
          <Text style={s.p}>Your photos back up to your Stash account on their own. Link once; nothing to do after that.</Text>
          {code ? (
            <View>
              <Text style={s.code}>{code}</Text>
              <Text style={s.p}>Approve it in the page that opened, or at {url}</Text>
              <ActivityIndicator style={{ marginTop: 16 }} />
            </View>
          ) : (
            <Pressable style={s.btn} onPress={link}>
              <Text style={s.btnText}>Get a code</Text>
            </Pressable>
          )}
        </View>
      )}

      {screen === "passcode" && (
        <View>
          <Text style={s.h1}>Enter your passcode</Text>
          <Text style={s.p}>Your files are locked with a passcode. Enter it once on this phone.{hint ? ` Hint: ${hint}` : ""}</Text>
          <TextInput secureTextEntry value={passcode} onChangeText={setPasscode} placeholder="Passcode" style={s.input} />
          <Pressable style={s.btn} onPress={submitPasscode}>
            <Text style={s.btnText}>Open</Text>
          </Pressable>
        </View>
      )}

      {screen === "allow" && (
        <View>
          <Text style={s.h1}>Allow photos</Text>
          <Text style={s.p}>One permission, then every photo and video you take is backed up, encrypted, without you doing anything.</Text>
          <Pressable style={s.btn} onPress={allow}>
            <Text style={s.btnText}>Allow access to photos</Text>
          </Pressable>
        </View>
      )}

      {screen === "status" && (
        <View>
          <Text style={s.h1}>Backing up</Text>
          {progress ? (
            <Text style={s.p}>
              {progress.done.toLocaleString()} of {progress.total.toLocaleString()} backed up
              {progress.pending ? ` · ${progress.pending.toLocaleString()} to go` : " · up to date"}
              {progress.failed ? ` · ${progress.failed} couldn't be sent` : ""}
              {progress.current ? `\n${progress.current}` : ""}
            </Text>
          ) : (
            <ActivityIndicator />
          )}
          <Text style={s.small}>New photos are sent when the phone gets a chance, usually within the hour. Open the app to send them right away.</Text>
        </View>
      )}

      {error && <Text style={s.error}>{error}</Text>}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, padding: 24, backgroundColor: "#fafafa" },
  brand: { fontSize: 22, fontWeight: "700", marginBottom: 32, color: "#111" },
  h1: { fontSize: 28, fontWeight: "600", color: "#111", marginBottom: 8 },
  p: { fontSize: 16, color: "#6b6b6b", lineHeight: 22, marginBottom: 16 },
  small: { fontSize: 13, color: "#8a8a8a", marginTop: 16 },
  code: { fontSize: 36, fontWeight: "700", letterSpacing: 6, color: "#111", textAlign: "center", marginVertical: 16 },
  btn: { backgroundColor: "#111", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#e4e4e4", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, fontSize: 16, backgroundColor: "#fff", marginBottom: 12 },
  error: { color: "#000", marginTop: 16 },
});

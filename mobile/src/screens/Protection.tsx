// The account's one decision (new accounts), the passcode screens, and the recovery code.
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Check } from "lucide-react-native";
import { Brand, Button, Card, ErrorLine, Field, font, H1, ink, ink2, ink3, line, P, Screen, tight } from "../ui";
import { useSession } from "../session";
import { me, setProtection } from "../api";
import { recoveryCode, unwrapKey, wrapKey } from "../crypto";
import { nextRoute } from "../flow";

type Nav = NativeStackNavigationProp<Record<string, undefined | { passcode: string; hint?: string }>>;

export function DecideScreen() {
  const nav = useNavigation<Nav>();
  const { cfg, update, existing } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function standard() {
    if (!cfg || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setProtection(cfg, { mode: "standard" });
      const next = await update({});
      nav.reset({ index: 0, routes: [await nextRoute(next, null, existing, 1)] });
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      top={
        <>
          <Brand />
        </>
      }
    >
      <H1>How private should your files be?</H1>
      <P>You can change this later in Settings.</P>
      <Card emphasis>
        <Text style={s.cardTitle}>
          Standard <Text style={s.tag}>Recommended</Text>
        </Text>
        <P>Opens wherever you sign in. Nothing to remember.</P>
        <P small>Stash can open your files, as Google Drive can. We never do unless you share one.</P>
        <Button title="Use Standard" onPress={standard} busy={busy} />
      </Card>
      <Card>
        <Text style={s.cardTitle}>
          Locked <Text style={s.tag}>More private</Text>
        </Text>
        <P>Only you can open them, with a passcode you choose.</P>
        <P small>Not even Stash can. Forget the passcode and the recovery code, and the files are gone.</P>
        <Button title="Lock my files" kind="outline" onPress={() => nav.navigate("ChoosePasscode")} disabled={busy} />
      </Card>
      <ErrorLine text={error} />
    </Screen>
  );
}

export function ChoosePasscodeScreen() {
  const nav = useNavigation<Nav>();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  function next() {
    if (a.length < 6) return setError("Use at least 6 characters.");
    if (a !== b) return setError("The two passcodes don’t match.");
    setError(null);
    nav.navigate("Recovery", { passcode: a, hint: hint.trim() || undefined });
  }
  return (
    <Screen
      top={
        <>
          <Brand />
        </>
      }
      bottom={
        <>
          <ErrorLine text={error} />
          <Button title="Next" onPress={next} />
        </>
      }
    >
      <H1>Choose a passcode</H1>
      <P>You will type this on every new device. Stash never sees it, so Stash cannot reset it.</P>
      <Field secureTextEntry value={a} onChangeText={setA} placeholder="Passcode" autoFocus />
      <Field secureTextEntry value={b} onChangeText={setB} placeholder="Again" />
      <Field value={hint} onChangeText={setHint} placeholder="A hint only you understand (optional)" />
    </Screen>
  );
}

// Locking happens here, once the person says they have the recovery code, as on the web.
export function RecoveryScreen(props: unknown) {
  const { route } = props as { route: { params: { passcode: string; hint?: string } } };
  const nav = useNavigation<Nav>();
  const { cfg, update, existing } = useSession();
  const [key, setKey] = useState<string | null>(null);
  const [written, setWritten] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  React.useEffect(() => {
    if (!cfg) return;
    me(cfg)
      .then((w) => setKey(w.key ?? null))
      .catch((e) => setError(String(e.message)));
  }, [cfg]);
  async function lock() {
    if (!cfg || !key || busy) return;
    setBusy(true);
    setError(null);
    try {
      const wrapped = await wrapKey(key, route.params.passcode, route.params.hint);
      await setProtection(cfg, { mode: "passcode", keyWrapped: wrapped });
      const next = await update({ key });
      nav.reset({ index: 0, routes: [await nextRoute(next, null, existing, 1)] });
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      top={
        <>
          <Brand />
        </>
      }
      bottom={
        <>
          <ErrorLine text={error} />
          <Button title="Lock my files" onPress={lock} busy={busy} disabled={!written || !key} />
        </>
      }
    >
      <H1>Your recovery code</H1>
      <P>If you ever forget the passcode, this code opens your files. Write it down somewhere safe.</P>
      <Text style={s.code} selectable>
        {key ? recoveryCode(key) : "…"}
      </Text>
      <Pressable style={s.checkRow} onPress={() => setWritten((v) => !v)}>
        <View style={[s.box, written && { backgroundColor: ink, borderColor: ink }]}>{written && <Check size={16} color="#fff" />}</View>
        <Text style={s.checkLabel}>I have written the recovery code down.</Text>
      </Pressable>
    </Screen>
  );
}

// Existing Locked account on a new phone: the passcode, once.
export function EnterPasscodeScreen() {
  const nav = useNavigation<Nav>();
  const { cfg, update, existing } = useSession();
  const [hint, setHint] = useState<string | undefined>();
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  React.useEffect(() => {
    if (cfg) me(cfg).then((w) => setHint(w.keyWrapped?.hint)).catch(() => {});
  }, [cfg]);
  async function open() {
    if (!cfg || busy) return;
    setBusy(true);
    setError(null);
    try {
      const w = await me(cfg);
      const raw = w.keyWrapped ? await unwrapKey(w.keyWrapped, pass) : null;
      if (!raw) return setError("That passcode didn’t open your files. Try again.");
      const next = await update({ key: raw });
      nav.reset({ index: 0, routes: [await nextRoute(next, w, existing, 1)] });
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      bottom={
        <>
          <ErrorLine text={error} />
          <Button title="Open" onPress={open} busy={busy} />
        </>
      }
      top={<Brand />}
    >
      <H1>Your passcode</H1>
      <P>Your files are locked with a passcode only you know. Enter it once on this phone.{hint ? ` Hint: ${hint}` : ""}</P>
      <Field secureTextEntry value={pass} onChangeText={setPass} placeholder="Passcode" autoFocus onSubmitEditing={open} />
      <P small>Forgot it? Use the recovery code on the website, in Settings.</P>
    </Screen>
  );
}

const s = StyleSheet.create({
  cardTitle: { fontSize: 22, fontFamily: font.semibold, color: ink, marginBottom: 6, ...tight(22) },
  tag: { fontSize: 13, fontFamily: font.medium, color: ink3, letterSpacing: 0 },
  code: { fontSize: 22, fontFamily: "monospace", letterSpacing: 1, textAlign: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: line, borderRadius: 12, padding: 16, marginBottom: 18, color: ink },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: ink2, alignItems: "center", justifyContent: "center" },
  checkLabel: { fontSize: 17, fontFamily: font.regular, color: ink, flex: 1 },
});

// Settings, as a grouped native list: the account, how the files are protected (and the
// recovery code), where files were moved from, taking everything with you, and this phone.
// The account loads from the phone first, so the page is never blank.
// (docs/phone/04-devices-and-settings.md, "Settings")

import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import * as BackgroundTask from "expo-background-task";
import Constants from "expo-constants";
import { Image } from "expo-image";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { Check, ChevronRight, Copy, Unplug } from "lucide-react-native";
import { Button, Card, font, ink, ink2, ink3, line, P } from "../ui";
import { useSession } from "../session";
import { account, disconnectGoogle, setProtection, signOutEverywhere, unlinkSelf, type Account } from "../api";
import { recoveryCode } from "../crypto";
import { connectGoogleDrive } from "../drivecopy";
import { TASK, VERSION } from "../backup";
import { nextRoute } from "../flow";
import { Sheet, SheetItem, SheetLine, Snackbar } from "../drive/parts";
import { fmtBytes, Group, PasscodeSheet, plural, red, s as p, TapRow, Title, TopBar, useSnack } from "../settings/parts";

type Nav = NativeStackNavigationProp<Record<string, { step: 1 | 2 | 3 } | undefined>>;
const CACHE = (FileSystem.documentDirectory ?? "") + "stash_account_v1.json";
// What My drive and Devices keep on the phone for this account; unlinking forgets them.
const LOCAL = ["stash_drive_v1.json", "stash_drive_prefs_v1.json", "stash_devices_v1.json", "stash_account_v1.json"];

// The account, from the phone first, then from Stash.
function useAccount() {
  const { cfg } = useSession();
  const [acct, setAcct] = useState<Account | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    FileSystem.readAsStringAsync(CACHE)
      .then((raw) => setAcct((a) => a ?? { ...JSON.parse(raw), keyWrapped: null }))
      .catch(() => {});
  }, []);
  const load = useCallback(async () => {
    if (!cfg?.token) return;
    try {
      const a = await account(cfg);
      setAcct(a);
      setError(false);
      FileSystem.writeAsStringAsync(CACHE, JSON.stringify({ ...a, keyWrapped: null })).catch(() => {});
      return a;
    } catch {
      setError(true);
    }
  }, [cfg]);
  return { acct, error, load };
}

export function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const { cfg, update, setExisting } = useSession();
  const insets = useSafeAreaInsets();
  const { acct, error: offline, load } = useAccount();
  const [snack, say] = useSnack();
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [askPass, setAskPass] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [importSheet, setImportSheet] = useState(false);
  const fail = (k: string, t: string | null) => setErrors((e) => ({ ...e, [k]: t }));

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const server = cfg?.server ?? "";
  const locked = acct?.protection === "passcode";

  function signOutAll() {
    Alert.alert("Sign out everywhere?", "Sign out of Stash in every browser where this account is signed in? Linked devices keep backing up.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out everywhere",
        style: "destructive",
        onPress: async () => {
          if (!cfg) return;
          fail("account", null);
          setBusy("signout");
          try {
            const n = await signOutEverywhere(cfg);
            say(n === 0 ? "No browsers were signed in." : `Signed out of ${plural(n ?? 0, "browser")}.`);
          } catch {
            fail("account", "Couldn’t reach Stash. Try again.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  // Imports: connecting opens Google in a browser tab, then the copy's progress, as in setup.
  async function moveFromGoogle() {
    if (!cfg || busy) return;
    fail("imports", null);
    if (!acct?.googleConnected) {
      setBusy("google");
      try {
        const r = await connectGoogleDrive(cfg);
        if (r === "cancelled") return;
        if (r !== "ok") return fail("imports", r === "denied" ? "Google Drive didn’t allow access. Try again." : "Couldn’t connect to Google Drive. Try again.");
      } catch {
        return fail("imports", "Couldn’t connect to Google Drive. Try again.");
      } finally {
        setBusy(null);
      }
    }
    setExisting(false); // the Move step shows its progress; it is on the full path only
    nav.navigate("Steps", { step: 2 });
  }

  async function disconnect() {
    setImportSheet(false);
    if (!cfg) return;
    try {
      await disconnectGoogle(cfg);
      await load();
      say("Google Drive disconnected. Everything already moved stays.");
    } catch {
      fail("imports", "Couldn’t disconnect. Try again.");
    }
  }

  function unlinkPhone() {
    Alert.alert("Unlink this phone?", "It stops backing up and signs out here. Everything already sent stays in Stash.", [
      { text: "Keep linked", style: "cancel" },
      {
        text: "Unlink",
        style: "destructive",
        onPress: async () => {
          if (!cfg) return;
          setBusy("unlink");
          try {
            await unlinkSelf(cfg);
            await BackgroundTask.unregisterTaskAsync(TASK).catch(() => {});
            await GoogleSignin.signOut().catch(() => {});
            // This phone forgets the account: what it kept to open files offline, and the lists.
            await SecureStore.deleteItemAsync("stash_drive_key_v1").catch(() => {});
            for (const f of LOCAL) await FileSystem.deleteAsync((FileSystem.documentDirectory ?? "") + f, { idempotent: true }).catch(() => {});
            await FileSystem.deleteAsync((FileSystem.documentDirectory ?? "") + "stash-kept/", { idempotent: true }).catch(() => {});
            const next = await update((c) => ({ server: c.server, settings: c.settings, setup: { seenCarousel: true } }));
            setExisting(true);
            nav.reset({ index: 0, routes: [await nextRoute(next, null, true)] });
          } catch {
            setBusy(null);
            fail("phone", "Couldn’t unlink. Try again.");
          }
        },
      },
    ]);
  }

  const version = Constants.expoConfig?.version;
  return (
    <SafeAreaView style={p.page} edges={["top", "left", "right"]}>
      <TopBar onBack={nav.canGoBack() ? () => nav.goBack() : undefined} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 + insets.bottom }}>
        <Title>Settings</Title>
        {offline && <Text style={[p.line, { marginBottom: 6 }]}>Can’t reach Stash right now. Showing what this phone knows.</Text>}

        <Group label="Account" first>
          <View style={s.account}>
            {acct?.picture ? (
              <Image source={{ uri: acct.picture }} style={s.avatar} contentFit="cover" />
            ) : (
              <View style={[s.avatar, s.initial]}>
                <Text style={s.initialText}>{(acct?.name ?? acct?.email ?? cfg?.email ?? "?").slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.accountName} numberOfLines={1}>
                {acct?.name ?? acct?.email ?? cfg?.email ?? "Your account"}
              </Text>
              {!!(acct?.email ?? cfg?.email) && (
                <Text style={s.accountLine} numberOfLines={1}>
                  {acct?.email ?? cfg?.email}
                </Text>
              )}
              {acct && (
                <Text style={s.accountLine}>
                  {plural(acct.fileCount, "file")} · {fmtBytes(acct.bytes)}
                </Text>
              )}
            </View>
          </View>
          <TapRow label="Sign out everywhere" note="Every browser where this account is signed in." onPress={signOutAll} disabled={busy === "signout"} />
          <RowError text={errors.account} />
        </Group>

        <Group label="How your files are protected">
          <TapRow
            label={acct ? (locked ? "Locked" : "Standard") : "…"}
            note={acct ? (locked ? "More private. Only you can open them, with your passcode." : "Recommended. Opens wherever you sign in.") : undefined}
            right={<ChevronRight size={18} color={ink3} />}
            onPress={() => nav.navigate("Protection")}
            disabled={!acct}
          />
          {locked && <TapRow label="Show recovery code" note="Asks for your passcode first." onPress={() => (setAskPass(true), load())} />}
        </Group>

        <Group label="Imports">
          <Text style={[p.line, s.groupLine]}>Where files were moved from. Nothing is deleted at the other end.</Text>
          <TapRow
            label="Google Drive"
            note={acct ? (acct.googleConnected ? "Connected" : "Not connected") : undefined}
            onPress={moveFromGoogle}
            onLongPress={acct?.googleConnected ? () => setImportSheet(true) : undefined}
            disabled={busy === "google"}
            right={<Text style={s.rowAction}>{acct?.googleConnected ? "Move again" : "Connect"}</Text>}
          />
          <RowError text={errors.imports} />
        </Group>

        <Group label="Take everything with you">
          <Text style={[p.line, s.groupLine]}>One zip with every file, in its folders. Do it on a computer; a phone hasn’t the room.</Text>
          <TapRow label="Send me the link" onPress={() => Share.share({ title: "Stash settings", message: `Download everything from Stash, on a computer:\n\n${server}/settings` }).catch(() => {})} />
        </Group>

        <Group label="This phone">
          {!!(cfg?.email ?? acct?.email) && <Text style={[p.line, s.groupLine]}>Linked as {cfg?.email ?? acct?.email}</Text>}
          <TapRow label="Unlink this phone" note="It stops backing up and signs out here. Everything already sent stays in Stash." danger onPress={unlinkPhone} disabled={busy === "unlink"} />
          <RowError text={errors.phone} />
        </Group>

        <Text style={s.version}>
          Stash {version ?? VERSION}
          {version && version !== VERSION ? ` · backup ${VERSION}` : ""}
        </Text>
      </ScrollView>

      {snack && (
        <View pointerEvents="box-none" style={[p.foot, { paddingBottom: 16 + insets.bottom }]}>
          <Snackbar text={snack} />
        </View>
      )}

      <Sheet visible={importSheet} onClose={() => setImportSheet(false)} title="Google Drive">
        <SheetLine>Stash stops looking at your Google Drive. Everything already moved stays here.</SheetLine>
        <SheetItem icon={Unplug} label="Disconnect" onPress={disconnect} />
      </Sheet>
      <PasscodeSheet
        visible={askPass}
        wrapped={acct?.keyWrapped ?? null}
        title="Show recovery code"
        line="Enter your passcode. The recovery code opens everything, so Stash asks every time."
        action="Show"
        onClose={() => setAskPass(false)}
        onOpen={(raw) => {
          setAskPass(false);
          setCode(recoveryCode(raw));
        }}
      />
      {code && <RecoverySheet code={code} onClose={() => setCode(null)} onCopied={() => say("Copied. It clears from the clipboard in a minute.")} />}
    </SafeAreaView>
  );
}

const RowError = ({ text }: { text?: string | null }) => (text ? <Text style={s.rowError}>{text}</Text> : null);

// The recovery code, with Copy: the clipboard forgets it after a minute.
function RecoverySheet({ code, onClose, onCopied }: { code: string; onClose: () => void; onCopied: () => void }) {
  async function copy() {
    await Clipboard.setStringAsync(code);
    setTimeout(async () => {
      if ((await Clipboard.getStringAsync().catch(() => "")) === code) await Clipboard.setStringAsync("").catch(() => {});
    }, 60_000);
    onClose();
    onCopied();
  }
  return (
    <Sheet visible onClose={onClose} title="Your recovery code">
      <SheetLine>If you ever forget the passcode, this code opens your files. Keep it somewhere safe, away from this phone.</SheetLine>
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={s.code} selectable={false}>
          {code}
        </Text>
      </View>
      <SheetItem icon={Copy} label="Copy" onPress={copy} />
    </Sheet>
  );
}

// --- How your files are protected (pushed): both options in the web's words.

export function ProtectionScreen() {
  const nav = useNavigation<Nav>();
  const { cfg, update } = useSession();
  const insets = useSafeAreaInsets();
  const { acct, load } = useAccount();
  const [snack, say] = useSnack();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const current = acct?.protection === "passcode" ? "passcode" : "standard";
  // Locking reuses the setup screens: choose a passcode, then the recovery code, which does the switch.
  const lock = () => nav.navigate("ChoosePasscode" as never);
  // Back to Standard: the passcode opens the files here, and the plain key goes to Stash.
  async function unlock(raw: string) {
    if (!cfg) return;
    setError(null);
    try {
      await setProtection(cfg, { mode: "standard", key: raw });
      await update({ key: raw });
      setAsking(false);
      await load();
      say("Your files are Standard now.");
    } catch {
      setError("Couldn’t change that. Try again.");
    }
  }

  const option = (mode: "standard" | "passcode") => {
    const on = !!acct && current === mode;
    return (
      <Card emphasis={on}>
        <View style={s.optionHead}>
          <Text style={s.optionTitle}>
            {mode === "standard" ? "Standard" : "Locked"} <Text style={s.tag}>{mode === "standard" ? "Recommended" : "More private"}</Text>
          </Text>
          {on && <Check size={20} color={ink} />}
        </View>
        <P>{mode === "standard" ? "Opens wherever you sign in. Nothing to remember." : "Only you can open them, with a passcode you choose."}</P>
        <P small>{mode === "standard" ? "Stash can open your files, as Google Drive can. We never do unless you share one." : "Not even Stash can. Forget the passcode and the recovery code, and the files are gone."}</P>
        {on && <Text style={s.now}>This is how your files are kept now.</Text>}
      </Card>
    );
  };

  return (
    <SafeAreaView style={p.page} edges={["top", "left", "right"]}>
      <TopBar onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 + insets.bottom }}>
        <View style={{ marginHorizontal: -20 }}>
          <Title>How your files are protected</Title>
        </View>
        <P>Encrypted before they are stored either way. The difference is whether Stash can open them for you, or only you can.</P>
        {option("standard")}
        {option("passcode")}
        {acct && (
          <View style={s.switchBlock}>
            <P small>{current === "passcode" ? "Going back to Standard takes your passcode once more." : "Locking takes a passcode you choose. You get a recovery code to keep."}</P>
            {error && <Text style={s.rowError}>{error}</Text>}
            {current === "passcode" ? <Button title="Go back to Standard" kind="outline" onPress={() => setAsking(true)} /> : <Button title="Lock my files" kind="outline" onPress={lock} />}
          </View>
        )}
      </ScrollView>
      <PasscodeSheet visible={asking} wrapped={acct?.keyWrapped ?? null} title="Your passcode" line="Enter it once more to go back to Standard." action="Go back to Standard" onClose={() => setAsking(false)} onOpen={unlock} />
      {snack && (
        <View pointerEvents="box-none" style={[p.foot, { paddingBottom: 16 + insets.bottom }]}>
          <Snackbar text={snack} />
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  account: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 20, paddingVertical: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: line },
  initial: { alignItems: "center", justifyContent: "center", backgroundColor: ink },
  initialText: { color: "#fff", fontSize: 22, fontFamily: font.semibold },
  accountName: { fontSize: 19, lineHeight: 25, fontFamily: font.semibold, color: ink, letterSpacing: -0.025 * 19 },
  accountLine: { fontSize: 14, lineHeight: 19, fontFamily: font.regular, color: ink3, marginTop: 1 },
  groupLine: { color: ink3, fontSize: 14, lineHeight: 19, marginBottom: 2 },
  rowAction: { fontSize: 16, fontFamily: font.medium, color: ink },
  rowError: { fontSize: 14, lineHeight: 19, fontFamily: font.regular, color: red, paddingHorizontal: 20, paddingBottom: 8 },
  version: { textAlign: "center", fontSize: 13, fontFamily: font.regular, color: ink3, marginTop: 40 },
  code: { fontSize: 20, fontFamily: "monospace", letterSpacing: 1, textAlign: "center", borderWidth: 1, borderColor: line, borderRadius: 12, padding: 16, marginBottom: 10, color: ink },
  optionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  optionTitle: { fontSize: 22, fontFamily: font.semibold, color: ink, letterSpacing: -0.025 * 22 },
  tag: { fontSize: 13, fontFamily: font.medium, color: ink3, letterSpacing: 0 },
  now: { fontSize: 14, fontFamily: font.medium, color: ink2 },
  switchBlock: { marginTop: 12, gap: 6 },
});


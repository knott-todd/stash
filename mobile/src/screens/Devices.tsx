// Devices: this phone first, from the phone itself, with its rules editable in place; then
// the account's other devices with what they keep safe and whether they are up to date.
// Tap or long-press a device for Rename and Unlink. Link a device is the + at the top.
// (docs/phone/04-devices-and-settings.md)

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as FileSystem from "expo-file-system/legacy";
import * as Device from "expo-device";
import { Laptop, Link2Off, Pencil, Plus, Smartphone } from "lucide-react-native";
import { Button, font, ink, ink2, ink3, line } from "../ui";
import { useSession } from "../session";
import { account, listDevices, renameDevice, unlinkDevice, type DeviceRow } from "../api";
import { Sheet, SheetItem, Snackbar } from "../drive/parts";
import { usePhoneBackup } from "../settings/phone";
import { ago, BarIcon, CardSkeleton, fmtBytes, NameSheet, PasscodeSheet, plural, red, s as p, SwitchRow, Title, TopBar, useSnack } from "../settings/parts";

type Nav = NativeStackNavigationProp<Record<string, { computerLinked?: boolean } | undefined>>;
const CACHE = (FileSystem.documentDirectory ?? "") + "stash_devices_v1.json";
const ok = "#2e9e5b";

export function DevicesScreen() {
  const nav = useNavigation<Nav>();
  const { cfg } = useSession();
  const insets = useSafeAreaInsets();
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [chosen, setChosen] = useState<DeviceRow | null>(null);
  const [sheet, setSheet] = useState<null | "actions" | "rename">(null);
  const [snack, say] = useSnack();

  // The last list, from the phone, so the page opens with something even offline.
  useEffect(() => {
    FileSystem.readAsStringAsync(CACHE)
      .then((raw) => setDevices((d) => d ?? JSON.parse(raw)))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!cfg?.token) return;
    setLoading(true);
    try {
      const { devices: list } = await listDevices(cfg);
      setDevices(list);
      setOffline(false);
      FileSystem.writeAsStringAsync(CACHE, JSON.stringify(list)).catch(() => {});
    } catch {
      setOffline(true);
    } finally {
      setNow(Date.now());
      setLoading(false);
    }
  }, [cfg]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const others = (devices ?? []).filter((d) => d.id !== cfg?.deviceId);
  const computerLinked = others.some((d) => d.kind === "desktop");
  const linkDevice = () => nav.navigate("LinkDevice", { computerLinked });

  function choose(d: DeviceRow) {
    setChosen(d);
    setSheet("actions");
  }

  function confirmUnlink(d: DeviceRow) {
    setSheet(null);
    Alert.alert(`Unlink ${d.name}?`, "It stops backing up. Everything it already sent stays here.", [
      { text: "Keep linked", style: "cancel" },
      {
        text: "Unlink",
        style: "destructive",
        onPress: async () => {
          if (!cfg) return;
          try {
            await unlinkDevice(cfg, d.id);
            setDevices((list) => (list ?? []).filter((x) => x.id !== d.id));
            say(`${d.name} unlinked`);
            load();
          } catch {
            say("Couldn’t unlink. Try again.");
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={p.page} edges={["top", "left", "right"]}>
      <TopBar onBack={nav.canGoBack() ? () => nav.goBack() : undefined} right={<BarIcon icon={Plus} label="Link a device" onPress={linkDevice} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 96 + insets.bottom }} refreshControl={<RefreshControl refreshing={loading && devices !== null} colors={[ink]} onRefresh={load} />}>
        <Title>Devices</Title>
        {offline && <Text style={[p.line, { marginBottom: 14 }]}>Can’t reach Stash right now. Pull down to try again.</Text>}

        <ThisPhone serverName={(devices ?? []).find((d) => d.id === cfg?.deviceId)?.name} />

        {devices === null && !offline ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : others.length === 0 ? (
          !offline && (
            <View style={s.alone}>
              <Text style={s.aloneLine}>Only this phone so far. Link your computer and its folders stay safe too.</Text>
              <Button title="Link a device" kind="outline" onPress={linkDevice} />
            </View>
          )
        ) : (
          others.map((d) => <OtherDevice key={d.id} d={d} now={now} onPress={() => choose(d)} />)
        )}
      </ScrollView>

      {snack && (
        <View pointerEvents="box-none" style={[p.foot, { paddingBottom: 16 + insets.bottom }]}>
          <Snackbar text={snack} />
        </View>
      )}

      <Sheet visible={sheet === "actions" && !!chosen} onClose={() => setSheet(null)} title={chosen?.name}>
        <SheetItem icon={Pencil} label="Rename" onPress={() => setSheet("rename")} />
        <Pressable onPress={() => chosen && confirmUnlink(chosen)} style={({ pressed }) => [s.danger, pressed && { backgroundColor: "#f0f0f0" }]} accessibilityRole="button">
          <Link2Off size={22} color={red} strokeWidth={1.7} />
          <Text style={s.dangerLabel}>Unlink</Text>
        </Pressable>
      </Sheet>
      <NameSheet
        visible={sheet === "rename" && !!chosen}
        title="Rename"
        initial={chosen?.name ?? ""}
        action="Save"
        onClose={() => setSheet(null)}
        onSubmit={async (name) => {
          if (!cfg || !chosen) return;
          if (name === chosen.name) return setSheet(null);
          try {
            await renameDevice(cfg, chosen.id, name);
            setDevices((list) => (list ?? []).map((x) => (x.id === chosen.id ? { ...x, name } : x)));
            setSheet(null);
            load();
          } catch {
            setSheet(null);
            say("Couldn’t rename. Try again.");
          }
        }}
      />
    </SafeAreaView>
  );
}

// --- This phone

function ThisPhone({ serverName }: { serverName?: string }) {
  const { cfg, update } = useSession();
  const b = usePhoneBackup();
  const [askPass, setAskPass] = useState(false);
  const [wrapped, setWrapped] = useState<{ salt: string; iv: string; ct: string; iter: number; hint?: string } | null>(null);
  const set = b.settings;
  const name = serverName ?? Device.deviceName ?? Device.modelName ?? "This phone";

  async function enterPasscode() {
    if (!cfg) return;
    setAskPass(true);
    account(cfg)
      .then((a) => setWrapped(a.keyWrapped))
      .catch(() => {});
  }

  const sees = b.perm === "granted" || b.perm === "limited";
  const toGo = b.progress?.pending ?? b.count?.pending ?? 0;
  let status: string;
  let action: { title: string; run: () => void } | null = null;
  if (!b.on) {
    status = "Not backing up yet. Your photos and videos back up on their own once it’s on.";
    action = { title: "Start backing up", run: () => b.start() };
  } else if (b.perm !== null && !sees) {
    status = "Stash can’t see your photos";
    action = { title: "Allow photos", run: () => (b.canAsk ? b.allow() : Linking.openSettings()) };
  } else if (b.locked) {
    status = "Enter your passcode to keep backing up";
    action = { title: "Enter passcode", run: enterPasscode };
  } else if (b.progress || b.sending) {
    status = toGo ? `Backing up · ${toGo.toLocaleString()} to go` : "Backing up";
  } else if (!b.count) {
    status = "Counting your photos…";
  } else if (b.count.pending) {
    const n = `${b.count.pending.toLocaleString()} waiting`;
    status = b.count.waitingFor === "wifi" ? `${n} · they’ll back up when you’re on Wi-Fi` : b.count.waitingFor === "charging" ? `${n} · they’ll back up next time you charge` : `${n} · they’ll back up shortly`;
  } else {
    status = b.lastRun ? `Up to date · checked ${ago(b.lastRun.at)}` : "Up to date";
  }
  const dot = !b.on || (b.perm !== null && !sees) || b.locked ? ink3 : b.progress || b.sending || b.count?.pending ? ink : ok;
  const what = set?.videos ? "photos and videos" : "photos";

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Smartphone size={26} color={ink2} strokeWidth={1.5} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.nameRow}>
            <Text style={s.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={s.tag}>This phone</Text>
          </View>
          <View style={s.statusRow}>
            <View style={[s.dot, { backgroundColor: dot }]} />
            <Text style={s.status}>{status}</Text>
          </View>
          {b.progress?.current && <Text style={s.current} numberOfLines={1}>{b.progress.current}</Text>}
          {action && (
            <View style={{ marginTop: 14 }}>
              <Button title={action.title} kind="outline" onPress={action.run} />
            </View>
          )}
          {b.on && sees && (
            <View style={s.sources}>
              <Text style={s.sourceLabel}>
                Camera roll{b.count ? ` · ${plural(b.count.total, "photo", what)}` : ""}
              </Text>
              {b.perm === "limited" && <Text style={s.sourceNote}>Only the photos you picked will back up.</Text>}
              {(b.lastRun?.failed ?? 0) > 0 && !b.progress && <Text style={s.sourceWarn}>{plural(b.lastRun!.failed, "photo")} couldn’t be sent</Text>}
            </View>
          )}
          {b.error && <Text style={s.error}>{b.error}</Text>}
          {b.on && sees && !b.locked && (
            <Pressable onPress={b.checkNow} disabled={!!b.progress || b.sending} hitSlop={8} style={s.checkNow} accessibilityRole="button">
              <Text style={[s.checkNowLabel, (!!b.progress || b.sending) && { opacity: 0.45 }]}>Check now</Text>
            </Pressable>
          )}
        </View>
      </View>
      {set && (
        <View style={s.rules}>
          <SwitchRow label="Only on Wi-Fi" note="Never uses mobile data." value={set.wifiOnly} onChange={(v) => b.setRule("wifiOnly", v)} />
          <SwitchRow label="Only while charging" note="The big first backup happens overnight, not in your pocket." value={set.chargingOnly} onChange={(v) => b.setRule("chargingOnly", v)} />
          <SwitchRow label="Include videos" note="Videos are large; turn this off to keep only photos safe." value={set.videos} onChange={(v) => b.setRule("videos", v)} />
        </View>
      )}
      <PasscodeSheet
        visible={askPass}
        wrapped={wrapped}
        title="Your passcode"
        line="Your files are locked with a passcode only you know. Enter it once on this phone."
        action="Open"
        onClose={() => setAskPass(false)}
        onOpen={async (raw) => {
          await update({ key: raw });
          setAskPass(false);
          b.unlocked();
          b.checkNow();
        }}
      />
    </View>
  );
}

// --- The account's other devices, in the web's words.

function OtherDevice({ d, now, onPress }: { d: DeviceRow; now: number; onPress: () => void }) {
  const stale = now - d.lastSeen > 5 * 60 * 1000;
  const st = d.state;
  const dot = stale ? ink3 : st?.status === "error" ? red : st?.status === "uploading" || st?.status === "scanning" ? ink : ok;
  const pending = st?.folders.reduce((n, f) => n + f.pending, 0) ?? 0;
  const status = stale
    ? `Not running right now · last seen ${ago(d.lastSeen, now)}`
    : !st
      ? "Linked. Waiting for its first report."
      : st.status === "uploading"
        ? `Backing up${st.detail ? `: ${st.detail}` : ""}`
        : st.status === "scanning"
          ? "Looking for new files"
          : st.status === "paused"
            ? "Paused on that device"
            : st.status === "error"
              ? `Needs attention: ${st.detail ?? "open Stash on that device"}`
              : pending
                ? `${plural(pending, "file")} waiting`
                : `Up to date · last seen ${ago(d.lastSeen, now)}`;
  const Icon = d.kind === "phone" ? Smartphone : Laptop;
  const folders = st?.folders ?? [];
  return (
    <Pressable onPress={onPress} onLongPress={onPress} delayLongPress={320} style={({ pressed }) => [s.card, s.divider, pressed && { backgroundColor: "#f0f0f0" }]} accessibilityRole="button" accessibilityHint="Rename or unlink">
      <View style={s.head}>
        <Icon size={26} color={ink2} strokeWidth={1.5} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.name} numberOfLines={1}>
            {d.name}
          </Text>
          <Text style={s.meta}>
            {plural(d.files, "file")}
            {d.bytes ? ` · ${fmtBytes(d.bytes)}` : ""}
          </Text>
          <View style={s.statusRow}>
            <View style={[s.dot, { backgroundColor: dot }]} />
            <Text style={s.status}>{status}</Text>
          </View>
          <View style={s.sources}>
            {folders.length ? (
              folders.map((f) => (
                <View key={f.path} style={s.source}>
                  <Text style={s.sourceLabel} numberOfLines={1}>
                    {f.label || f.path}
                  </Text>
                  <Text style={s.sourceNote}>
                    {plural(f.files, "file")}
                    {f.pending > 0 ? ` · ${f.pending.toLocaleString()} waiting` : ""}
                  </Text>
                  {f.failed > 0 && <Text style={s.sourceWarn}>{f.failed.toLocaleString()} couldn’t be sent</Text>}
                </View>
              ))
            ) : (
              <Text style={s.sourceNote}>Nothing chosen yet. Pick folders in Stash on that device.</Text>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// --- Link a device (pushed): the device you add does the rest on itself.

const INSTALLER = "https://github.com/knott-todd/stash/releases/latest/download/Stash-Setup.exe";

export function LinkDeviceScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<Record<string, { computerLinked?: boolean } | undefined>, string>>();
  const { cfg } = useSession();
  const insets = useSafeAreaInsets();
  const server = cfg?.server ?? "";

  const computer = (primary: boolean) => (
    <Option
      key="computer"
      icon={Laptop}
      title="My computer"
      line="Send yourself the installer link and open it on that computer."
      action="Send the link"
      primary={primary}
      onPress={() =>
        Share.share({
          title: "Stash for your computer",
          message: `Install Stash on your computer to keep it backed up:\n\n${INSTALLER}\n\nOpen it, click "Link this computer", and say yes in your browser.\n\nWindows may warn about an unsigned installer the first time; choose More info, then Run anyway.`,
        }).catch(() => {})
      }
    />
  );
  const phone = (primary: boolean) => (
    <Option
      key="phone"
      icon={Smartphone}
      title="Another phone"
      line="Install Stash there and continue with the same Google account."
      action="Send the app link"
      primary={primary}
      onPress={() => Share.share({ title: "Stash for your phone", message: `Stash for your phone:\n\n${server}\n\nInstall it there and continue with the same Google account.` }).catch(() => {})}
    />
  );

  return (
    <SafeAreaView style={p.page} edges={["top", "left", "right"]}>
      <TopBar onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}>
        <Title sub="The device you add does the rest on itself.">Link a device</Title>
        {params?.computerLinked ? [phone(true), computer(false)] : [computer(true), phone(false)]}
      </ScrollView>
    </SafeAreaView>
  );
}

function Option({ icon: I, title, line: text, action, primary, onPress }: { icon: typeof Laptop; title: string; line: string; action: string; primary: boolean; onPress: () => void }) {
  return (
    <View style={[s.card, s.divider]}>
      <View style={s.head}>
        <I size={26} color={ink2} strokeWidth={1.5} />
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{title}</Text>
          <Text style={[s.status, { marginTop: 4, marginBottom: 16 }]}>{text}</Text>
          <Button title={action} kind={primary ? "primary" : "outline"} onPress={onPress} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { paddingHorizontal: 20, paddingVertical: 18 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line },
  head: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  nameRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  name: { fontSize: 19, lineHeight: 25, fontFamily: font.semibold, color: ink, letterSpacing: -0.025 * 19, flexShrink: 1 },
  tag: { fontSize: 13, fontFamily: font.medium, color: ink3 },
  meta: { fontSize: 14, lineHeight: 19, fontFamily: font.regular, color: ink3, marginTop: 1 },
  statusRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  status: { flex: 1, fontSize: 15, lineHeight: 21, fontFamily: font.regular, color: ink2 },
  current: { fontSize: 13, fontFamily: font.regular, color: ink3, marginTop: 4, marginLeft: 16 },
  sources: { marginTop: 14, marginLeft: 2, borderLeftWidth: 2, borderLeftColor: line, paddingLeft: 14, gap: 10 },
  source: { gap: 1 },
  sourceLabel: { fontSize: 15, lineHeight: 20, fontFamily: font.medium, color: ink },
  sourceNote: { fontSize: 14, lineHeight: 19, fontFamily: font.regular, color: ink3 },
  sourceWarn: { fontSize: 14, lineHeight: 19, fontFamily: font.regular, color: red },
  error: { fontSize: 14, lineHeight: 19, fontFamily: font.regular, color: red, marginTop: 10 },
  checkNow: { alignSelf: "flex-start", marginTop: 12, paddingVertical: 4 },
  checkNowLabel: { fontSize: 16, fontFamily: font.medium, color: ink, textDecorationLine: "underline" },
  rules: { marginTop: 10, marginHorizontal: -20 },
  alone: { paddingHorizontal: 20, paddingTop: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line, gap: 16 },
  aloneLine: { fontSize: 16, lineHeight: 23, fontFamily: font.regular, color: ink2 },
  danger: { flexDirection: "row", alignItems: "center", gap: 18, minHeight: 56, paddingHorizontal: 16, borderRadius: 12 },
  dangerLabel: { fontSize: 17, fontFamily: font.regular, color: red },
});

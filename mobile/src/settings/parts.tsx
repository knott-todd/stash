// The parts Devices and Settings share: the bar at the top, a group's quiet label, a row with
// a switch (as in setup's step 3), a tappable row, the sheets that take a name or the
// passcode, the message at the foot, and the small formatting both screens need.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { ArrowLeft, type LucideIcon } from "lucide-react-native";
import { Button, ErrorLine, Field, font, ink, ink2, ink3, line, paper, tight } from "../ui";
import { Sheet, SheetLine } from "../drive/parts";
import { unwrapKey } from "../crypto";

export const red = "#c62828";

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
export function ago(t: number, now = Date.now()) {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// --- The bar: back when there is somewhere to go back to, one action at the right.

export function TopBar({ onBack, right }: { onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View style={s.bar}>
      {onBack ? <BarIcon icon={ArrowLeft} label="Back" onPress={onBack} /> : <View style={{ width: 8 }} />}
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

export function BarIcon({ icon: I, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityLabel={label} accessibilityRole="button" style={({ pressed }) => [s.barIcon, pressed && { backgroundColor: "#ececec" }]}>
      <I size={24} color={ink} strokeWidth={1.8} />
    </Pressable>
  );
}

export const Title = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <View style={s.titleBlock}>
    <Text style={s.title} accessibilityRole="header">
      {children}
    </Text>
    {!!sub && <Text style={s.subtitle}>{sub}</Text>}
  </View>
);

export const Group = ({ label, children, first = false }: { label: string; children: React.ReactNode; first?: boolean }) => (
  <View style={[s.group, first && { marginTop: 0 }]}>
    <Text style={s.groupLabel} accessibilityRole="header">
      {label}
    </Text>
    {children}
  </View>
);

export function SwitchRow({ label, note, value, onChange, disabled = false }: { label: string; note: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={s.switchRow}>
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowNote}>{note}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: ink }} thumbColor="#fff" accessibilityLabel={label} />
    </View>
  );
}

// A row the thumb can press: label, one line under it, something at the right.
export function TapRow({ label, note, right, onPress, onLongPress, danger = false, disabled = false }: { label: string; note?: string; right?: React.ReactNode; onPress?: () => void; onLongPress?: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={320} disabled={disabled || (!onPress && !onLongPress)} accessibilityRole={onPress ? "button" : undefined} style={({ pressed }) => [s.tapRow, pressed && { backgroundColor: "#f0f0f0" }, disabled && { opacity: 0.45 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowLabel, danger && { color: red }]}>{label}</Text>
        {!!note && <Text style={s.rowNote}>{note}</Text>}
      </View>
      {right}
    </Pressable>
  );
}

// --- Sheets

export function NameSheet({ visible, title, initial, action, onClose, onSubmit }: { visible: boolean; title: string; initial: string; action: string; onClose: () => void; onSubmit: (name: string) => Promise<void> }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ref = useRef<TextInput>(null);
  useEffect(() => {
    if (!visible) return;
    setV(initial);
    const t = setTimeout(() => {
      ref.current?.focus();
      ref.current?.setSelection?.(0, initial.length);
    }, 280);
    return () => clearTimeout(t);
  }, [visible, initial]);
  const submit = async () => {
    const name = v.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onSubmit(name);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={s.sheetBody}>
        <Field ref={ref} value={v} onChangeText={setV} autoCorrect={false} returnKeyType="done" onSubmitEditing={submit} maxLength={60} />
        <Button title={action} onPress={submit} busy={busy} disabled={!v.trim()} />
      </View>
    </Sheet>
  );
}

type Wrapped = { salt: string; iv: string; ct: string; iter: number; hint?: string };

// The passcode, asked in a sheet: opens the files on this phone (or proves it is you).
export function PasscodeSheet({ visible, wrapped, title, line: text, action, onClose, onOpen }: { visible: boolean; wrapped: Wrapped | null; title: string; line: string; action: string; onClose: () => void; onOpen: (raw: string) => void | Promise<void> }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setPass("");
      setError(null);
    }
  }, [visible]);
  const open = async () => {
    if (!wrapped || busy || !pass) return;
    setBusy(true);
    setError(null);
    try {
      const raw = await unwrapKey(wrapped, pass);
      if (!raw) return setError("That passcode didn’t open your files. Try again.");
      await onOpen(raw);
    } catch {
      setError("That passcode didn’t open your files. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <SheetLine>
        {text}
        {wrapped?.hint ? ` Hint: ${wrapped.hint}` : ""}
      </SheetLine>
      <View style={s.sheetBody}>
        <Field secureTextEntry value={pass} onChangeText={setPass} placeholder="Passcode" autoFocus onSubmitEditing={open} returnKeyType="done" />
        <ErrorLine text={error} />
        <Button title={action} onPress={open} busy={busy} disabled={!pass || !wrapped} />
      </View>
    </Sheet>
  );
}

// --- The message at the foot, gone after a few seconds.

export function useSnack() {
  const [snack, setSnack] = useState<string | null>(null);
  useEffect(() => {
    if (!snack) return;
    const t = setTimeout(() => setSnack(null), 4000);
    return () => clearTimeout(t);
  }, [snack]);
  return [snack, useCallback((t: string) => setSnack(t), [])] as const;
}

// --- Loading: quiet cards that breathe.

export function CardSkeleton() {
  const o = useSharedValue(0.55);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[s.skel, st]}>
      <View style={s.skelIcon} />
      <View style={{ flex: 1, gap: 10 }}>
        <View style={[s.skelBar, { width: "55%" }]} />
        <View style={[s.skelBar, { width: "35%", height: 10 }]} />
        <View style={[s.skelBar, { width: "70%", height: 10, marginTop: 6 }]} />
      </View>
    </Animated.View>
  );
}

export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: paper },
  bar: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  barIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  titleBlock: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 18 },
  title: { fontSize: 34, lineHeight: 39, fontFamily: font.semibold, color: ink, letterSpacing: -0.035 * 34 },
  subtitle: { fontSize: 15, fontFamily: font.regular, color: ink3, marginTop: 4 },
  group: { marginTop: 30 },
  groupLabel: { fontSize: 14, fontFamily: font.medium, color: ink3, paddingHorizontal: 20, marginBottom: 4 },
  switchRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 20 },
  tapRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56, paddingVertical: 12, paddingHorizontal: 20 },
  rowLabel: { fontSize: 17, fontFamily: font.regular, color: ink },
  rowNote: { fontSize: 14, lineHeight: 19, fontFamily: font.regular, color: ink3, marginTop: 2 },
  line: { fontSize: 15, lineHeight: 21, fontFamily: font.regular, color: ink2, paddingHorizontal: 20 },
  sheetBody: { paddingHorizontal: 16, paddingTop: 6 },
  foot: { position: "absolute", left: 16, right: 16, bottom: 0 },
  skel: { flexDirection: "row", gap: 16, paddingHorizontal: 20, paddingVertical: 18 },
  skelIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: line },
  skelBar: { height: 13, borderRadius: 6, backgroundColor: line },
  h2: { fontSize: 20, lineHeight: 26, fontFamily: font.semibold, color: ink, ...tight(20) },
});

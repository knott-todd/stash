// The app's small set of parts, so every screen reads the same way: one title, one line,
// one primary action at the bottom, quiet secondaries. Colours and type follow the website.

import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const ink = "#111111";
export const ink2 = "#6b6b6b";
export const ink3 = "#8a8a8a";
export const line = "#e4e4e4";
export const paper = "#fafafa";
export const accent = "#1a56db";

export function Screen({ children, bottom, scroll = true, centered = false }: { children: React.ReactNode; bottom?: React.ReactNode; scroll?: boolean; centered?: boolean }) {
  const body = <View style={[s.body, centered && s.centered]}>{children}</View>;
  return (
    <SafeAreaView style={s.page}>
      {scroll ? (
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {bottom && <View style={s.bottom}>{bottom}</View>}
    </SafeAreaView>
  );
}

export const Brand = () => (
  <Text style={s.brand}>
    Stash<Text style={{ color: accent }}>.</Text>
  </Text>
);

export const H1 = ({ children }: { children: React.ReactNode }) => <Text style={s.h1}>{children}</Text>;
export const P = ({ children, small = false }: { children: React.ReactNode; small?: boolean }) => <Text style={small ? s.small : s.p}>{children}</Text>;
export const ErrorLine = ({ text }: { text: string | null }) => (text ? <Text style={s.error}>{text}</Text> : null);

export function Button({ title, onPress, busy = false, disabled = false, kind = "primary" }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; kind?: "primary" | "outline" | "text" }) {
  const off = disabled || busy;
  if (kind === "text")
    return (
      <Pressable onPress={onPress} disabled={off} style={s.textBtn} hitSlop={8}>
        <Text style={[s.textBtnLabel, off && { opacity: 0.5 }]}>{title}</Text>
      </Pressable>
    );
  return (
    <Pressable onPress={onPress} disabled={off} style={[kind === "primary" ? s.btn : s.btnOutline, off && { opacity: 0.6 }]}>
      {busy ? <ActivityIndicator color={kind === "primary" ? "#fff" : ink} /> : <Text style={kind === "primary" ? s.btnLabel : s.btnOutlineLabel}>{title}</Text>}
    </Pressable>
  );
}

export const Field = (props: TextInputProps) => <TextInput placeholderTextColor={ink3} {...props} style={[s.input, props.style]} />;

// "Step 1 of 3": filled segments for the steps done, the current one in ink, the rest in line.
export function Segments({ step, of = 3 }: { step: number; of?: number }) {
  return (
    <View style={s.segments} accessibilityLabel={`Step ${step} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <View key={i} style={[s.segment, i < step && { backgroundColor: ink }]} />
      ))}
      <Text style={s.segmentLabel}>
        Step {step} of {of}
      </Text>
    </View>
  );
}

export function Card({ children, emphasis = false }: { children: React.ReactNode; emphasis?: boolean }) {
  return <View style={[s.card, emphasis && { borderColor: ink }]}>{children}</View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: paper },
  scroll: { flexGrow: 1 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
  centered: { justifyContent: "center", paddingBottom: 80 },
  bottom: { paddingHorizontal: 24, paddingBottom: 20, paddingTop: 8, gap: 4 },
  brand: { fontSize: 22, fontWeight: "700", color: ink, marginBottom: 28 },
  h1: { fontSize: 30, lineHeight: 36, fontWeight: "600", color: ink, marginBottom: 10 },
  p: { fontSize: 16, lineHeight: 23, color: ink2, marginBottom: 14 },
  small: { fontSize: 13, lineHeight: 18, color: ink3, marginBottom: 10 },
  error: { fontSize: 14, color: ink, marginBottom: 10 },
  btn: { backgroundColor: ink, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  btnLabel: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnOutline: { backgroundColor: "#fff", borderWidth: 1, borderColor: line, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  btnOutlineLabel: { color: ink, fontSize: 16, fontWeight: "600" },
  textBtn: { paddingVertical: 12, alignItems: "center" },
  textBtnLabel: { color: ink2, fontSize: 15 },
  input: { borderWidth: 1, borderColor: line, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 13, fontSize: 16, backgroundColor: "#fff", marginBottom: 12, color: ink },
  segments: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 22 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: line },
  segmentLabel: { marginLeft: 8, fontSize: 12, color: ink3 },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: line, borderRadius: 16, padding: 18, marginBottom: 12 },
});

// The app's small set of parts, so every screen reads the same way: one title, one line,
// one primary action at the bottom, quiet secondaries. Colours and type follow the website.

import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

export const ink = "#111111";
export const ink2 = "#6b6b6b";
export const ink3 = "#8a8a8a";
export const line = "#e4e4e4";
export const faint = "#bdbdbd"; // the steps you are not on
export const paper = "#fafafa";
export const accent = "#1a56db";

// The website's face, Geist, at the website's tracking: this is most of the brand's voice.
export const font = { regular: "Geist_400Regular", medium: "Geist_500Medium", semibold: "Geist_600SemiBold", bold: "Geist_700Bold" };
export const tight = (size: number) => ({ letterSpacing: -0.025 * size });

// `top` stays pinned (the brand); with `centered` the children sit in the middle of the space below it.
export function Screen({ children, bottom, top, scroll = true, centered = false }: { children: React.ReactNode; bottom?: React.ReactNode; top?: React.ReactNode; scroll?: boolean; centered?: boolean }) {
  const body = (
    <View style={s.body}>
      {top}
      <View style={[{ flex: 1 }, centered && s.centered]}>{children}</View>
    </View>
  );
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

// The mark from the brand kit (loft/src/app/icon.svg) beside the wordmark, as the web header shows it.
export const Brand = () => (
  <View style={s.brandRow}>
    <Image source={require("../assets/mark.svg")} style={s.mark} contentFit="contain" />
    <Text style={s.brand}>
      Stash<Text style={{ color: accent }}>.</Text>
    </Text>
  </View>
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

// "3 easy steps" as one stacked title, the way the website stacks "Free. Unlimited. Private.":
// the current step large in ink, the other two small and faded in their places (done ones struck).
// This is the only place a step screen shows progress: no bar, no "Step N of 3", no ticks.
const STEPS = ["Sign in with Google", "Move my files here", "Back up this phone"];
// `alone` (a returning account doing one step): the same large title, without numeral or list.
export function StepTitle({ current, alone = false }: { current: number; alone?: boolean }) {
  if (alone)
    return (
      <View style={s.stack}>
        <Text style={s.stepNow} accessibilityRole="header">
          {STEPS[current - 1]}
        </Text>
      </View>
    );
  return (
    <View style={s.stack} accessible accessibilityRole="header" accessibilityLabel={`Step ${current} of 3. ${STEPS[current - 1]}`}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        return (
          <Text key={n} style={n === current ? s.stepNow : [s.stepOther, n < current && s.stepDone]}>
            {n}. {label}
          </Text>
        );
      })}
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
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 28 },
  mark: { width: 30, height: 30, borderRadius: 7 },
  brand: { fontSize: 23, fontFamily: font.semibold, color: ink, ...tight(23) },
  h1: { fontSize: 38, lineHeight: 44, fontFamily: font.semibold, color: ink, marginBottom: 12, ...tight(38) },
  p: { fontSize: 17, lineHeight: 25, fontFamily: font.regular, color: ink2, marginBottom: 14 },
  small: { fontSize: 14, lineHeight: 19, fontFamily: font.regular, color: ink3, marginBottom: 10 },
  error: { fontSize: 15, fontFamily: font.regular, color: ink, marginBottom: 10 },
  btn: { backgroundColor: ink, borderRadius: 14, paddingVertical: 17, alignItems: "center" },
  btnLabel: { color: "#fff", fontSize: 17, fontFamily: font.medium },
  btnOutline: { backgroundColor: "#fff", borderWidth: 1, borderColor: line, borderRadius: 14, paddingVertical: 17, alignItems: "center" },
  btnOutlineLabel: { color: ink, fontSize: 17, fontFamily: font.medium },
  textBtn: { paddingVertical: 12, alignItems: "center" },
  textBtnLabel: { color: ink2, fontSize: 16, fontFamily: font.regular },
  input: { borderWidth: 1, borderColor: line, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 13, fontSize: 17, fontFamily: font.regular, backgroundColor: "#fff", marginBottom: 12, color: ink },
  // The website's hero: semibold, line-height ~1.05, tracking -0.035em; the other steps at a quiet 22.
  stack: { marginTop: 20, marginBottom: 20 },
  stepNow: { fontSize: 42, lineHeight: 45, fontFamily: font.semibold, color: ink, letterSpacing: -0.035 * 42, marginVertical: 10 },
  stepOther: { fontSize: 22, lineHeight: 29, fontFamily: font.semibold, color: faint, ...tight(22) },
  stepDone: { textDecorationLine: "line-through" },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: line, borderRadius: 16, padding: 18, marginBottom: 12 },
});

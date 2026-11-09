// The small parts My drive is made of: the bottom sheet (what a dialog or a menu becomes on a
// phone), its rows, the message at the foot, the upload ring, skeleton rows, the thin line,
// a row's leading picture or icon, and a name that keeps its extension.

import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Svg, { Circle } from "react-native-svg";
import { File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, type LucideIcon } from "lucide-react-native";
import { font, ink, ink2, ink3, line, paper, tight } from "../ui";
import type { FileRow } from "../api";
import { cachedThumb, hasPreview, thumb } from "./store";

// --- Sheet

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View entering={SlideInDown.duration(260).easing(Easing.out(Easing.cubic))} style={[s.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={s.grab} />
          {title ? <Text style={s.sheetTitle} numberOfLines={2}>{title}</Text> : null}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetItem({ icon: I, label, onPress, disabled = false }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.item, pressed && { backgroundColor: "#f0f0f0" }, disabled && { opacity: 0.4 }]} accessibilityRole="button">
      <I size={22} color={ink} strokeWidth={1.7} />
      <Text style={s.itemLabel}>{label}</Text>
    </Pressable>
  );
}

export const SheetLine = ({ children }: { children: React.ReactNode }) => <Text style={s.sheetLine}>{children}</Text>;

// --- The message at the foot: one line, an optional action, gone after a few seconds.

export function Snackbar({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={s.snack} accessibilityLiveRegion="polite">
      <Text style={s.snackText}>{text}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={s.snackAction}>{action}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// --- The ring an upload row shows in its leading slot.

export function Ring({ progress, size = 28 }: { progress: number; size?: number }) {
  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={line} strokeWidth={2.5} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={ink} strokeWidth={2.5} fill="none" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - Math.max(0.03, Math.min(1, progress)))} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </Svg>
  );
}

// --- First load: five quiet rows that breathe.

export function Skeleton() {
  const o = useSharedValue(0.55);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={st}>
      {[0.62, 0.44, 0.7, 0.5, 0.38].map((w, i) => (
        <View key={i} style={s.row}>
          <View style={s.skelThumb} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[s.skelBar, { width: `${w * 100}%` }]} />
            <View style={[s.skelBar, { width: "28%", height: 9 }]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

// --- The thin line while the list is fetched behind what is already shown.

export function ThinLine({ on }: { on: boolean }) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = on ? withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, false) : 0;
  }, [on, x]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: -w * 0.4 + x.value * w * 1.4 }] }));
  return (
    <View style={s.thin} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {on && <Animated.View style={[s.thinBar, { width: w * 0.4 }, st]} />}
    </View>
  );
}

// --- A row's leading slot: the picture's preview, or the type's icon.

export const iconFor = (f: Pick<FileRow, "mime" | "name">): LucideIcon => {
  const m = f.mime;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (m.startsWith("image/")) return FileImage;
  if (m.startsWith("video/")) return FileVideo;
  if (m.startsWith("audio/")) return FileAudio;
  if (/zip|compressed|tar|rar|7z/.test(m) || ["zip", "rar", "7z", "gz", "tar"].includes(ext)) return FileArchive;
  if (/sheet|excel|csv/.test(m) || ["xls", "xlsx", "csv", "numbers"].includes(ext)) return FileSpreadsheet;
  if (/json|javascript|xml|html/.test(m) || ["js", "ts", "py", "json", "html", "css"].includes(ext)) return FileCode;
  if (m.startsWith("text/") || m.includes("pdf") || /word|document|presentation/.test(m)) return FileText;
  return File;
};

export function Leading({ f }: { f: FileRow }) {
  const [uri, setUri] = useState<string | null>(() => cachedThumb(f.id));
  useEffect(() => {
    let live = true;
    if (!uri && hasPreview(f)) thumb(f).then((u) => live && u && setUri(u));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.id, f.thumb]);
  if (uri) return <Image source={{ uri }} style={s.thumb} contentFit="cover" transition={140} recyclingKey={f.id} />;
  const I = iconFor(f);
  return (
    <View style={s.lead}>
      <I size={24} color={ink2} strokeWidth={1.5} />
    </View>
  );
}

export const FolderLeading = () => (
  <View style={s.lead}>
    <Folder size={24} color={ink2} strokeWidth={1.5} />
  </View>
);

// Ellipsis before the extension: "A very long report na….pdf" keeps ".pdf".
export function Name({ name, style }: { name: string; style?: object }) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : "";
  const base = ext ? name.slice(0, dot) : name;
  return (
    <View style={{ flexDirection: "row", minWidth: 0 }}>
      <Text style={[s.name, style, { flexShrink: 1 }]} numberOfLines={1}>
        {base}
      </Text>
      {!!ext && <Text style={[s.name, style]}>{ext}</Text>}
    </View>
  );
}

export const LEAD = 40;

const s = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.32)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10, paddingHorizontal: 8 },
  grab: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: line, marginBottom: 10 },
  sheetTitle: { fontSize: 20, lineHeight: 26, fontFamily: font.semibold, color: ink, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, ...tight(20) },
  sheetLine: { fontSize: 15, lineHeight: 21, fontFamily: font.regular, color: ink2, paddingHorizontal: 16, paddingBottom: 10 },
  item: { flexDirection: "row", alignItems: "center", gap: 18, minHeight: 56, paddingHorizontal: 16, borderRadius: 12 },
  itemLabel: { fontSize: 17, fontFamily: font.regular, color: ink },
  snack: { flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: ink, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14 },
  snackText: { flex: 1, color: "#fff", fontSize: 15, lineHeight: 20, fontFamily: font.regular },
  snackAction: { color: "#fff", fontSize: 15, fontFamily: font.semibold },
  row: { flexDirection: "row", alignItems: "center", gap: 16, height: 64, paddingHorizontal: 20 },
  skelThumb: { width: LEAD, height: LEAD, borderRadius: 10, backgroundColor: line },
  skelBar: { height: 12, borderRadius: 6, backgroundColor: line },
  thin: { height: 2, overflow: "hidden", backgroundColor: paper },
  thinBar: { height: 2, backgroundColor: ink3 },
  thumb: { width: LEAD, height: LEAD, borderRadius: 10, backgroundColor: line },
  lead: { width: LEAD, height: LEAD, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, lineHeight: 21, color: ink, fontFamily: font.medium, letterSpacing: -0.15 },
});

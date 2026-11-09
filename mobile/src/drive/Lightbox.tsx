// Pictures, full screen, swiping through the folder they are in. The preview shows at once;
// the picture itself replaces it when it has been fetched and opened on this phone.
// (The Photos screen, docs/phone/03-photos.md, reuses this.)

import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StatusBar, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import { Share2, X } from "lucide-react-native";
import type { FileRow } from "../api";
import { font } from "../ui";
import { cachedThumb, plainFile, thumb } from "./store";

export function Lightbox({ items, start, onClose }: { items: FileRow[]; start: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(start);
  const f = items[index];
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={s.page}>
        <FlatList
          data={items}
          horizontal
          pagingEnabled
          initialScrollIndex={start}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(x) => x.id}
          windowSize={3}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => <Page f={item} width={width} height={height} />}
        />
        <View style={[s.bar, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close" style={s.icon}>
            <X size={24} color="#fff" />
          </Pressable>
          <Text style={s.name} numberOfLines={1}>
            {f?.name}
          </Text>
          <Pressable
            hitSlop={12}
            accessibilityLabel="Share"
            style={s.icon}
            onPress={async () => {
              if (!f) return;
              try {
                await Sharing.shareAsync(await plainFile(f), { mimeType: f.mime, dialogTitle: f.name });
              } catch {}
            }}
          >
            <Share2 size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Page({ f, width, height }: { f: FileRow; width: number; height: number }) {
  const [preview, setPreview] = useState<string | null>(() => cachedThumb(f.id));
  const [full, setFull] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    if (!preview) thumb(f).then((u) => live && u && setPreview(u));
    plainFile(f)
      .then((u) => live && setFull(u))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.id]);
  return (
    <View style={{ width, height, justifyContent: "center", alignItems: "center" }}>
      {(full || preview) && <Image source={{ uri: full ?? preview! }} placeholder={preview ? { uri: preview } : undefined} style={{ width, height }} contentFit="contain" transition={180} />}
      {!full && !failed && !preview && <ActivityIndicator color="#fff" />}
      {failed && !full && <Text style={s.fail}>Couldn’t open {f.name}.</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#000" },
  bar: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 10, backgroundColor: "rgba(0,0,0,0.35)" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  name: { flex: 1, color: "#fff", fontSize: 16, fontFamily: font.medium, textAlign: "center", marginHorizontal: 8 },
  fail: { color: "#fff", fontSize: 15, fontFamily: font.regular, position: "absolute", bottom: 80 },
});

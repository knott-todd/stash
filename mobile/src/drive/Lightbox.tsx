// Pictures and videos, full screen, swiping through the folder they are in. The preview shows
// at once; the picture itself (or the playing video) replaces it when it has been fetched and
// opened on this phone. A video plays inline with the phone's own controls, pauses when swiped
// away, and its player is released when it leaves the screen or the viewer closes.
// (The Photos screen, docs/phone/03-photos.md, reuses this.)

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StatusBar, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import { useVideoPlayer, VideoView } from "expo-video";
import { Share2, X } from "lucide-react-native";
import type { FileRow } from "../api";
import { font } from "../ui";
import { cachedThumb, isVideo, plainFile, thumb } from "./store";

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
          extraData={index}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: i }) => <Page f={item} width={width} height={height} active={i === index} />}
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

function Page({ f, width, height, active }: { f: FileRow; width: number; height: number; active: boolean }) {
  const [preview, setPreview] = useState<string | null>(() => cachedThumb(f.id));
  const [full, setFull] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const video = isVideo(f);
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
  const shown = video ? (full ? null : preview) : full ?? preview;
  return (
    <View style={{ width, height, justifyContent: "center", alignItems: "center" }}>
      {shown && <Image source={{ uri: shown }} placeholder={preview && !video ? { uri: preview } : undefined} style={{ width, height }} contentFit="contain" transition={180} />}
      {video && full && <Player uri={full} width={width} height={height} active={active} />}
      {!full && !failed && (!preview || video) && <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} />}
      {failed && !full && <Text style={s.fail}>Couldn’t open {f.name}.</Text>}
    </View>
  );
}

// Made only once the video is decrypted, so the source never changes under the player.
function Player({ uri, width, height, active }: { uri: string; width: number; height: number; active: boolean }) {
  const player = useVideoPlayer(uri);
  const started = useRef(false);
  useEffect(() => {
    if (active && !started.current) {
      started.current = true;
      player.play();
    } else if (!active) player.pause();
  }, [active, player]);
  return <VideoView player={player} nativeControls contentFit="contain" allowsPictureInPicture={false} style={{ width, height }} />;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#000" },
  bar: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 10, backgroundColor: "rgba(0,0,0,0.35)" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  name: { flex: 1, color: "#fff", fontSize: 16, fontFamily: font.medium, textAlign: "center", marginHorizontal: 8 },
  fail: { color: "#fff", fontSize: 15, fontFamily: font.regular, position: "absolute", bottom: 80 },
});

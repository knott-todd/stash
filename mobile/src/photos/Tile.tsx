// One square of the grid and the queue that feeds it. Phone pictures draw straight from the
// camera roll; Stash pictures ask for their decrypted preview through a small queue, newest
// request first, so what is on screen now wins and tiles scrolled past are cancelled before
// they start. While the scrubber is dragged, tiles stay placeholders.

import React, { memo, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Check, CloudUpload, Play } from "lucide-react-native";
import { ink } from "../ui";
import type { FileRow } from "../api";
import * as drive from "../drive/store";
import { useScrubbing, type Item } from "./model";

type Req = { f: FileRow; cb: (u: string | null) => void; dead: boolean };
const queue: Req[] = [];
let active = 0;
const MAX = 3;

function pump() {
  while (active < MAX && queue.length) {
    const r = queue.pop()!;
    if (r.dead) continue;
    active++;
    drive
      .thumb(r.f)
      .then((u) => !r.dead && r.cb(u))
      .catch(() => !r.dead && r.cb(null))
      .finally(() => {
        active--;
        pump();
      });
  }
}

function want(f: FileRow, cb: (u: string | null) => void): () => void {
  const r: Req = { f, cb, dead: false };
  queue.push(r);
  pump();
  return () => {
    r.dead = true;
    const i = queue.indexOf(r);
    if (i >= 0) queue.splice(i, 1);
  };
}

export const muted = "#e9e9e9";

export const Tile = memo(function Tile({ item, size, selecting, selected, onPress }: { item: Item; size: number; selecting: boolean; selected: boolean; onPress: (it: Item) => void }) {
  const local = item.local?.uri ?? null;
  const f = item.file;
  const [uri, setUri] = useState<string | null>(() => local ?? (f ? drive.cachedThumb(f.id) : null));
  const [attempt, setAttempt] = useState(0);
  const scrubbing = useScrubbing();
  useEffect(() => {
    if (uri || !f || scrubbing || !drive.hasPreview(f)) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // A failed tile stays a placeholder and tries again while it is in view.
    const cancel = want(f, (u) => (u ? setUri(u) : (retry = setTimeout(() => setAttempt((a) => a + 1), Math.min(30_000, 4000 * (attempt + 1))))));
    return () => {
      cancel();
      clearTimeout(retry);
    };
  }, [f, uri, scrubbing, attempt]);

  return (
    <Pressable onPress={() => onPress(item)} style={{ width: size, height: size, backgroundColor: muted }} accessibilityRole="imagebutton" accessibilityLabel={item.file?.name ?? item.local?.name} accessibilityState={{ selected }}>
      {uri && <Image source={{ uri }} style={[StyleSheet.absoluteFill, selected && s.shrunk]} contentFit="cover" transition={120} recyclingKey={item.key} cachePolicy={local ? "memory-disk" : "memory"} />}
      {item.video && (
        <View style={s.play}>
          <Play size={size > 90 ? 16 : 13} color="#fff" fill="#fff" strokeWidth={1.5} />
        </View>
      )}
      {item.pending && (
        <View style={s.pending} accessibilityLabel="Waiting to back up">
          <CloudUpload size={size > 90 ? 16 : 13} color="#fff" strokeWidth={2} />
        </View>
      )}
      {selecting && <View style={[s.circle, selected && s.circleOn]}>{selected && <Check size={14} color="#fff" strokeWidth={3} />}</View>}
    </Pressable>
  );
});

const shadow = { shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 0 } };
const s = StyleSheet.create({
  shrunk: { transform: [{ scale: 0.86 }], borderRadius: 6 },
  play: { position: "absolute", top: 6, right: 6, ...shadow },
  pending: { position: "absolute", bottom: 6, right: 6, ...shadow },
  circle: { position: "absolute", top: 6, left: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "#fff", backgroundColor: "rgba(0,0,0,0.12)", alignItems: "center", justifyContent: "center" },
  circleOn: { backgroundColor: ink, borderColor: "#fff" },
});

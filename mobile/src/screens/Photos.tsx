// Photos (docs/phone/03-photos.md). Every picture and video in Stash plus this phone's, each once,
// newest first by date taken, by day under a header that sticks. One recycled list whose rows
// are all computed ahead (headers and rows of square tiles), so it scrolls any length and jumps
// anywhere: pinch changes 3, 4 or 6 across, the handle on the right drags by month. Long-press a
// tile and drag to sweep a selection; a day's circle takes the day. Pictures open in the shared
// full-screen viewer and swipe through the whole timeline. The strip says what waits to back up.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated as RNAnimated, AppState, BackHandler, FlatList, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useFocusEffect, useNavigation, usePreventRemove } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { ArrowLeft, Check, Download, Info, Share2, Trash2, X } from "lucide-react-native";
import { Button, font, ink, ink2, ink3, line, paper, tight } from "../ui";
import { useSession } from "../session";
import type { FileRow } from "../api";
import { backupNews } from "../events";
import * as drive from "../drive/store";
import { Sheet, SheetLine, Snackbar, ThinLine } from "../drive/parts";
import { Lightbox } from "../drive/Lightbox";
import { fmtBytes } from "./Drive";
import * as photos from "../photos/model";
import { GAP, HEADER_H, type Item, type Layout, type Row } from "../photos/model";
import { muted, Tile } from "../photos/Tile";
import { BackupStrip } from "../photos/Strip";

type Nav = NativeStackNavigationProp<Record<string, object | undefined>>;
const COLS: photos.Cols[] = [3, 4, 6];
const HANDLE_H = 44;
const EDGE = 56; // a sweep this close to the top or bottom scrolls the grid

export function PhotosScreen() {
  const nav = useNavigation<Nav>();
  const { cfg } = useSession();
  const st = drive.useDrive();
  const ph = photos.usePhotos();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<{ rows: FileRow[]; start: number; byId: Map<string, Item> } | null>(null);
  const [sheet, setSheet] = useState<null | { kind: "delete"; items: Item[] }>(null);
  const [focused, setFocused] = useState(true);
  const [gridH, setGridH] = useState(0);
  const [topH, setTopH] = useState(0);
  const [sweeping, setSweeping] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const selecting = selected.size > 0;

  // --- Data: the drive's list (cached on disk) and this phone's roll (cached on disk).

  useEffect(() => {
    if (!cfg?.token) return;
    drive.startDrive(cfg);
    photos.startLocal(cfg);
  }, [cfg]);
  useEffect(
    () =>
      backupNews.on((n) => {
        if (n.last) drive.addFile(n.last);
        if (!n.sending) photos.readDone();
      }),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      drive.check();
      if (cfg) photos.startLocal(cfg);
      let t = setInterval(() => drive.check(), backupNews.get().sending ? 10_000 : 60_000);
      const off = backupNews.on((n) => {
        clearInterval(t);
        t = setInterval(() => drive.check(), n.sending ? 10_000 : 60_000);
      });
      const app = AppState.addEventListener("change", (s) => {
        if (s !== "active") return;
        drive.check();
        if (cfg) photos.startLocal(cfg);
      });
      return () => {
        setFocused(false);
        clearInterval(t);
        off();
        app.remove();
      };
    }, [cfg]),
  );
  useEffect(() => {
    if (!st.toast) return;
    const t = setTimeout(drive.clearToast, st.toast.ms - (Date.now() - st.toast.at));
    return () => clearTimeout(t);
  }, [st.toast]);

  const items = useMemo(() => photos.buildTimeline(st.files ?? [], ph.assets ?? [], ph.done, ph.links), [st.files, ph.assets, ph.done, ph.links]);
  const lay = useMemo(() => photos.layout(items, ph.cols, width), [items, ph.cols, width]);
  const pendingItems = useMemo(() => items.filter((x) => x.pending), [items]);
  const kinds = useMemo(() => ({ photos: pendingItems.filter((x) => !x.video).length, videos: pendingItems.filter((x) => x.video).length }), [pendingItems]);
  const backupOn = cfg?.setup?.backup === true && ph.permission === true;

  // The latest of everything, for the gesture and scroll handlers made once.
  const layRef = useRef(lay);
  layRef.current = lay;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const selRef = useRef(selected);
  selRef.current = selected;
  const listRef = useRef<FlatList<Row>>(null);
  const scrollY = useRef(0);
  const gridHRef = useRef(0);
  gridHRef.current = gridH;

  // --- Back leaves selection first.

  const clear = useCallback(() => setSelected(new Set()), []);
  usePreventRemove(selecting, clear);
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!selecting) return false;
        clear();
        return true;
      });
      return () => sub.remove();
    }, [selecting, clear]),
  );

  // --- Pinch: 3, 4 or 6 across, remembered; the picture at the top stays at the top.

  const anchor = useRef<number | null>(null);
  useEffect(() => {
    if (anchor.current === null) return;
    const r = photos.rowOfItem(lay, anchor.current);
    anchor.current = null;
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: lay.offsets[r] ?? 0, animated: false }));
  }, [lay]);

  // --- Scrubber: a handle on the right edge while scrolling; dragging jumps by month.

  const handleY = useRef(new RNAnimated.Value(0)).current;
  const handleOpacity = useRef(new RNAnimated.Value(0)).current;
  const handlePos = useRef(0);
  const dragging = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastMonth = useRef<string | null>(null);
  const scrubBase = useRef(0);
  const scrubbable = lay.total > gridH * 4;
  const showHandle = () => {
    RNAnimated.timing(handleOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => !dragging.current && RNAnimated.timing(handleOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(), 1500);
  };

  // --- Sweep: long-press a tile, then drag; the grid scrolls when the finger nears an edge.

  const sweep = useRef<{ anchor: number; base: Set<string>; add: boolean; last: number; x: number; y: number } | null>(null);
  const edgeTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const h = useRef({
    onScroll(_y: number) {},
    pinch(_scale: number) {},
    start(_x: number, _y: number) {},
    move(_x: number, _y: number) {},
    end() {},
    scrubStart() {},
    scrubMove(_dy: number) {},
    scrubEnd() {},
  });
  h.current = {
    onScroll(y) {
      scrollY.current = y;
      const l = layRef.current;
      const r = photos.rowAt(l, Math.max(0, y));
      const head = r >= 0 ? l.headerOf[r] : 0;
      if (head !== topH) setTopH(head);
      if (!dragging.current && scrubbable) {
        const track = Math.max(1, gridHRef.current - HANDLE_H);
        const max = Math.max(1, l.total - gridHRef.current);
        handlePos.current = Math.min(track, Math.max(0, (y / max) * track));
        handleY.setValue(handlePos.current);
        showHandle();
      }
      if (sweep.current) h.current.move(sweep.current.x, sweep.current.y);
    },
    pinch(scale) {
      const i = COLS.indexOf(photos.photosState().cols);
      const next = scale > 1.15 ? COLS[Math.max(0, i - 1)] : scale < 0.87 ? COLS[Math.min(COLS.length - 1, i + 1)] : COLS[i];
      if (next === COLS[i]) return;
      const l = layRef.current;
      anchor.current = l.rows[Math.max(0, photos.rowAt(l, scrollY.current))]?.first ?? 0;
      Haptics.selectionAsync().catch(() => {});
      photos.setCols(next);
    },
    start(x, y) {
      const idx = photos.itemAt(layRef.current, x, y + scrollY.current);
      if (idx < 0) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const base = new Set(selRef.current);
      sweep.current = { anchor: idx, base, add: !base.has(itemsRef.current[idx].key), last: -1, x, y };
      setSweeping(true);
      h.current.move(x, y);
      clearInterval(edgeTimer.current);
      edgeTimer.current = setInterval(() => {
        const sw = sweep.current;
        if (!sw) return;
        const dir = sw.y < EDGE ? -1 : sw.y > gridHRef.current - EDGE ? 1 : 0;
        if (!dir) return;
        const max = Math.max(0, layRef.current.total - gridHRef.current);
        const next = Math.min(max, Math.max(0, scrollY.current + dir * 18));
        if (next !== scrollY.current) listRef.current?.scrollToOffset({ offset: next, animated: false });
      }, 16);
    },
    move(x, y) {
      const sw = sweep.current;
      if (!sw) return;
      sw.x = x;
      sw.y = y;
      const idx = photos.itemAt(layRef.current, x, y + scrollY.current);
      if (idx < 0 || idx === sw.last) return;
      sw.last = idx;
      const list = itemsRef.current;
      const next = new Set(sw.base);
      for (let i = Math.min(sw.anchor, idx); i <= Math.max(sw.anchor, idx); i++) {
        if (sw.add) next.add(list[i].key);
        else next.delete(list[i].key);
      }
      setSelected(next);
    },
    end() {
      clearInterval(edgeTimer.current);
      if (!sweep.current) return;
      sweep.current = null;
      setSweeping(false);
    },
    scrubStart() {
      dragging.current = true;
      lastMonth.current = null;
      photos.setScrubbing(true);
      clearTimeout(hideTimer.current);
      RNAnimated.timing(handleOpacity, { toValue: 1, duration: 80, useNativeDriver: true }).start();
      Haptics.selectionAsync().catch(() => {});
      scrubBase.current = handlePos.current;
    },
    scrubMove(dy) {
      const l = layRef.current;
      const track = Math.max(1, gridHRef.current - HANDLE_H);
      const max = Math.max(0, l.total - gridHRef.current);
      const pos = Math.min(track, Math.max(0, scrubBase.current + dy));
      handlePos.current = pos;
      handleY.setValue(pos);
      const m = photos.monthAt(l, (pos / track) * max);
      if (!m || m.label === lastMonth.current) return;
      lastMonth.current = m.label;
      setBubble(m.label);
      Haptics.selectionAsync().catch(() => {});
      listRef.current?.scrollToOffset({ offset: Math.min(m.offset, max), animated: false });
    },
    scrubEnd() {
      dragging.current = false;
      photos.setScrubbing(false);
      setBubble(null);
      showHandle();
    },
  };

  const scrubber = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => h.current.scrubStart(),
      onPanResponderMove: (_, g) => h.current.scrubMove(g.dy),
      onPanResponderRelease: () => h.current.scrubEnd(),
      onPanResponderTerminate: () => h.current.scrubEnd(),
    }),
  ).current;

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onEnd((e) => h.current.pinch(e.scale));
    const press = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .activateAfterLongPress(320)
      .minDistance(0)
      .failOffsetX([-12, 12])
      .failOffsetY([-12, 12])
      .onStart((e) => h.current.start(e.x, e.y))
      .onUpdate((e) => h.current.move(e.x, e.y))
      .onFinalize(() => h.current.end());
    return Gesture.Race(pinch, press);
  }, []);

  // --- Actions

  const onTile = useCallback(
    (it: Item) => {
      if (selRef.current.size) {
        setSelected((s) => {
          const n = new Set(s);
          if (n.has(it.key)) n.delete(it.key);
          else n.add(it.key);
          return n;
        });
        return;
      }
      const list = itemsRef.current;
      const rows = list.map(photos.asFileRow);
      setViewer({ rows, start: Math.max(0, list.indexOf(it)), byId: new Map(rows.map((r, i) => [r.id, list[i]])) });
    },
    [],
  );

  const onDay = useCallback((row: Row) => {
    const keys = itemsRef.current.slice(row.first, row.first + row.n).map((x) => x.key);
    setSelected((s) => {
      const n = new Set(s);
      const all = keys.every((k) => n.has(k));
      for (const k of keys) {
        if (all) n.delete(k);
        else n.add(k);
      }
      return n;
    });
  }, []);

  async function share(it: Item) {
    const f = photos.asFileRow(it);
    try {
      let path: string;
      if (it.local) {
        const info = await MediaLibrary.getAssetInfoAsync(it.local.id);
        path = info.localUri ?? it.local.uri;
      } else path = await drive.plainFile(it.file!);
      await Sharing.shareAsync(path, { mimeType: f.mime, dialogTitle: f.name });
    } catch {
      drive.toast(`Couldn't share ${f.name}.`);
    }
  }

  // Into the phone's own gallery. The new phone picture is remembered as this Stash file.
  async function save(list: Item[]) {
    const files = list.filter((x) => x.file && !x.local).map((x) => x.file!);
    if (!files.length) return;
    const perm = await MediaLibrary.requestPermissionsAsync(false, ["photo", "video"]).catch(() => null);
    if (!perm?.granted) return drive.toast("Stash needs access to your photos to save them.");
    let n = 0;
    for (const f of files) {
      try {
        const a = await MediaLibrary.createAssetAsync(await drive.plainFile(f));
        await photos.linkSaved(a, f.id);
        n++;
      } catch {}
    }
    if (cfg) photos.rescan(cfg);
    drive.toast(n === files.length ? "Saved to your phone" : n ? `Saved ${n.toLocaleString()} of ${files.length.toLocaleString()} to your phone.` : "Couldn't save to your phone.");
  }

  function trash(list: Item[]) {
    const ids = list.filter((x) => x.file).map((x) => x.file!.id);
    if (ids.length) drive.trash(ids);
  }

  const selItems = useMemo(() => items.filter((x) => selected.has(x.key)), [items, selected]);
  const savable = selItems.filter((x) => x.file && !x.local);
  const deletable = selItems.filter((x) => x.file);
  const extra = useMemo(() => [selected, lay], [selected, lay]);

  // --- Render

  const loading = st.files === null && st.status !== "error" && !(ph.assets?.length ?? 0);
  const failedEmpty = st.files === null && st.status === "error" && !(ph.assets?.length ?? 0);
  const empty = !loading && !failedEmpty && items.length === 0;
  const count = items.length;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={s.page} edges={["top", "left", "right"]}>
        {selecting ? (
          <Animated.View entering={FadeIn.duration(140)} style={s.bar56}>
            <BarIcon icon={X} label="Clear selection" onPress={clear} />
            <Text style={s.selCount}>{selected.size.toLocaleString()} selected</Text>
          </Animated.View>
        ) : (
          <View style={s.bar56}>{nav.canGoBack() ? <BarIcon icon={ArrowLeft} label="Back" onPress={() => nav.goBack()} /> : null}</View>
        )}
        <View style={s.titleBlock}>
          <Text style={s.title} accessibilityRole="header">
            Photos
          </Text>
          {count > 0 && <Text style={s.subtitle}>{`${count.toLocaleString()} ${count === 1 ? (items[0].video ? "video" : "photo") : "photos and videos"}`}</Text>}
        </View>
        <BackupStrip cfg={cfg} on={backupOn} pending={pendingItems.length} kinds={kinds} offline={st.offline} onOpen={() => nav.navigate("DevicesTab" as never)} />
        <ThinLine on={st.checking} />

        <View style={{ flex: 1 }} onLayout={(e) => setGridH(e.nativeEvent.layout.height)}>
          {loading ? (
            <SkeletonGrid width={width} />
          ) : failedEmpty ? (
            <View style={s.quiet}>
              <Text style={s.quietLine}>Couldn’t reach Stash. Check your connection.</Text>
              <Button title="Try again" kind="outline" onPress={() => drive.refresh().catch(() => {})} />
            </View>
          ) : empty ? (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>No photos or videos yet.</Text>
              <Text style={s.emptyLine}>Pictures from this phone and your computer gather here as they are backed up.</Text>
              {cfg?.setup?.backup !== true && (
                <View style={{ marginTop: 24 }}>
                  <Button title="Back up this phone" onPress={() => nav.navigate("Steps", { step: 3 })} />
                </View>
              )}
            </View>
          ) : (
            <>
              <GestureDetector gesture={gesture}>
                <View style={{ flex: 1 }} collapsable={false}>
                  <FlatList
                    ref={listRef}
                    data={lay.rows}
                    keyExtractor={(r) => r.key}
                    getItemLayout={(_, i) => ({ length: lay.heights[i] ?? 0, offset: lay.offsets[i] ?? 0, index: i })}
                    extraData={extra}
                    scrollEnabled={!sweeping}
                    onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => h.current.onScroll(e.nativeEvent.contentOffset.y)}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={12}
                    maxToRenderPerBatch={8}
                    updateCellsBatchingPeriod={30}
                    windowSize={5}
                    removeClippedSubviews
                    contentContainerStyle={{ paddingBottom: (selecting ? 80 : 24) + insets.bottom }}
                    renderItem={({ item }) =>
                      item.kind === "h" ? (
                        <DayHeader row={item} selecting={selecting} all={dayAll(items, item, selected)} onDay={onDay} />
                      ) : (
                        <GridRow row={item} items={items} tile={lay.tile} selecting={selecting} selected={selected} onTile={onTile} />
                      )
                    }
                  />
                </View>
              </GestureDetector>
              {/* The day you are in stays at the top. */}
              {lay.rows[topH]?.kind === "h" && (
                <View style={s.sticky}>
                  <DayHeader row={lay.rows[topH] as HeadRow} selecting={selecting} all={dayAll(items, lay.rows[topH], selected)} onDay={onDay} />
                </View>
              )}
              {scrubbable && (
                <RNAnimated.View style={[s.handleWrap, { opacity: handleOpacity, transform: [{ translateY: handleY }] }]} {...scrubber.panHandlers} accessibilityLabel="Scroll by month">
                  <View style={s.handle}>
                    <View style={s.grip} />
                    <View style={s.grip} />
                  </View>
                  {bubble && (
                    <Animated.View entering={FadeIn.duration(100)} exiting={FadeOut.duration(140)} style={s.bubble} pointerEvents="none">
                      <Text style={s.bubbleText}>{bubble}</Text>
                    </Animated.View>
                  )}
                </RNAnimated.View>
              )}
            </>
          )}
        </View>

        {focused && (
          <View pointerEvents="box-none" style={[s.foot, { paddingBottom: (selecting ? 76 : 16) + insets.bottom }]}>
            {st.toast && <Snackbar text={st.toast.text} action={st.toast.action?.label} onAction={st.toast.action?.run} />}
          </View>
        )}

        {selecting && (
          <Animated.View entering={FadeIn.duration(160)} style={[s.selBar, { paddingBottom: 8 + insets.bottom }]}>
            <BottomAction icon={Share2} label="Share" disabled={selItems.length !== 1} onPress={() => selItems[0] && share(selItems[0]).then(clear)} />
            <BottomAction icon={Download} label="Save to phone" disabled={!savable.length} onPress={() => save(savable).then(clear)} />
            <BottomAction icon={Trash2} label="Delete" disabled={!deletable.length || st.offline} onPress={() => setSheet({ kind: "delete", items: deletable })} />
          </Animated.View>
        )}

        {sheet?.kind === "delete" && (
          <DeleteSheet
            items={sheet.items}
            onClose={() => setSheet(null)}
            onConfirm={() => {
              trash(sheet.items);
              setSheet(null);
              clear();
            }}
          />
        )}

        {viewer && (
          <Lightbox
            items={viewer.rows}
            start={viewer.start}
            onClose={() => setViewer(null)}
            localUri={(f) => viewer.byId.get(f.id)?.local?.uri}
            caption={(f) => photos.fullWhen(viewer.byId.get(f.id)?.t ?? photos.when(f))}
            onShare={(f) => {
              const it = viewer.byId.get(f.id);
              if (it) share(it);
            }}
            footer={(f, close) => {
              const it = viewer.byId.get(f.id);
              return it ? <ViewerActions key={it.key} item={it} offline={st.offline} close={close} onSave={() => save([it])} onDelete={() => trash([it])} /> : null;
            }}
          />
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

type HeadRow = Extract<Row, { kind: "h" }>;
const dayAll = (items: Item[], row: Row, selected: Set<string>) => {
  if (!selected.size) return false;
  for (let i = row.first; i < row.first + row.n; i++) if (!selected.has(items[i].key)) return false;
  return true;
};

// --- Rows

const DayHeader = React.memo(function DayHeader({ row, selecting, all, onDay }: { row: HeadRow; selecting: boolean; all: boolean; onDay: (r: Row) => void }) {
  return (
    <View style={s.header}>
      {selecting && (
        <Pressable onPress={() => onDay(row)} hitSlop={12} accessibilityRole="checkbox" accessibilityState={{ checked: all }} accessibilityLabel={`Select ${row.label}`} style={[s.dayCircle, all && s.dayCircleOn]}>
          {all && <Check size={14} color="#fff" strokeWidth={3} />}
        </Pressable>
      )}
      <Text style={s.headerLabel} numberOfLines={1}>
        {row.label}
      </Text>
      <Text style={s.headerCount}>{row.n.toLocaleString()}</Text>
    </View>
  );
});

const GridRow = React.memo(function GridRow({ row, items, tile, selecting, selected, onTile }: { row: Row; items: Item[]; tile: number; selecting: boolean; selected: Set<string>; onTile: (it: Item) => void }) {
  const cells: React.ReactNode[] = [];
  for (let i = row.first; i < row.first + row.n; i++) {
    const it = items[i];
    if (!it) continue;
    cells.push(<Tile key={it.key} item={it} size={tile} selecting={selecting} selected={selected.has(it.key)} onPress={onTile} />);
  }
  return <View style={[s.gridRow, { height: tile + GAP }]}>{cells}</View>;
});

// Loading: quiet headers and squares, no spinner.
function SkeletonGrid({ width }: { width: number }) {
  const tile = Math.floor((width - GAP * 3) / 4);
  const block = (rows: number, key: string, w: number) => (
    <View key={key}>
      <View style={s.header}>
        <View style={[s.skelBar, { width: w }]} />
      </View>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={[s.gridRow, { height: tile + GAP }]}>
          {[0, 1, 2, 3].map((c) => (
            <View key={c} style={{ width: tile, height: tile, backgroundColor: muted }} />
          ))}
        </View>
      ))}
    </View>
  );
  return (
    <View accessibilityLabel="Loading photos">
      {block(2, "a", 64)}
      {block(1, "b", 88)}
      {block(3, "c", 72)}
    </View>
  );
}

// --- Bars and sheets

function BarIcon({ icon: I, label, onPress }: { icon: typeof X; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityLabel={label} accessibilityRole="button" style={({ pressed }) => [s.barIcon, pressed && { backgroundColor: "#ececec" }]}>
      <I size={22} color={ink} strokeWidth={1.8} />
    </Pressable>
  );
}

function BottomAction({ icon: I, label, onPress, disabled = false }: { icon: typeof X; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.bottomAction, pressed && { opacity: 0.6 }, disabled && { opacity: 0.3 }]} accessibilityRole="button" accessibilityLabel={label}>
      <I size={22} color={ink} strokeWidth={1.7} />
      <Text style={s.bottomLabel}>{label}</Text>
    </Pressable>
  );
}

function DeleteSheet({ items, onClose, onConfirm }: { items: Item[]; onClose: () => void; onConfirm: () => void }) {
  const n = items.length;
  const kinds = { photos: items.filter((x) => !x.video).length, videos: items.filter((x) => x.video).length };
  const onPhone = items.filter((x) => x.local).length;
  return (
    <Sheet visible onClose={onClose} title={n === 1 ? "Move to Trash?" : `Move ${n.toLocaleString()} ${photos.noun(n, kinds)} to Trash?`}>
      <SheetLine>{n === 1 ? "You can restore it from Trash in My drive." : "You can restore them from Trash in My drive."}</SheetLine>
      {onPhone > 0 && <SheetLine>{n === 1 ? "The copy on this phone stays." : onPhone === 1 ? "The copy on this phone stays." : "The copies on this phone stay."}</SheetLine>}
      <View style={{ paddingHorizontal: 16, paddingTop: 6, gap: 4 }}>
        <Button title="Move to Trash" onPress={onConfirm} />
        <Button title="Cancel" kind="text" onPress={onClose} />
      </View>
    </Sheet>
  );
}

const statusOf = (it: Item) => (it.file && it.local ? "On this phone and safe in Stash" : it.file ? "Safe in Stash" : it.pending ? "Waiting to back up" : "On this phone");

// The viewer's foot: Save to phone (not when the picture is already on it), Delete, Info.
function ViewerActions({ item, offline, close, onSave, onDelete }: { item: Item; offline: boolean; close: () => void; onSave: () => Promise<void>; onDelete: () => void }) {
  const [sheet, setSheet] = useState<null | "delete" | "info">(null);
  const [saving, setSaving] = useState(false);
  const f = photos.asFileRow(item);
  return (
    <>
      {item.file && !item.local && (
        <ViewerAction
          icon={Download}
          label="Save to phone"
          disabled={saving}
          onPress={() => {
            setSaving(true);
            onSave().finally(() => setSaving(false));
          }}
        />
      )}
      {item.file && <ViewerAction icon={Trash2} label="Delete" disabled={offline} onPress={() => setSheet("delete")} />}
      <ViewerAction icon={Info} label="Info" onPress={() => setSheet("info")} />
      {sheet === "delete" && (
        <DeleteSheet
          items={[item]}
          onClose={() => setSheet(null)}
          onConfirm={() => {
            setSheet(null);
            onDelete();
            close();
          }}
        />
      )}
      <Sheet visible={sheet === "info"} onClose={() => setSheet(null)} title={f.name}>
        <InfoLine label="Date" value={photos.fullWhen(item.t)} />
        {item.file && <InfoLine label="Size" value={fmtBytes(item.file.size)} />}
        <InfoLine label="Folder" value={item.file ? (item.file.folder ? item.file.folder.split("/").join(" / ") : "My drive") : "This phone"} />
        <InfoLine label="" value={statusOf(item)} />
      </Sheet>
    </>
  );
}

function ViewerAction({ icon: I, label, onPress, disabled = false }: { icon: typeof X; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={[s.viewerAction, disabled && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={label}>
      <I size={22} color="#fff" strokeWidth={1.7} />
      <Text style={s.viewerLabel}>{label}</Text>
    </Pressable>
  );
}

const InfoLine = ({ label, value }: { label: string; value: string }) => (
  <View style={s.infoLine}>
    {!!label && <Text style={s.infoLabel}>{label}</Text>}
    <Text style={[s.infoValue, !label && { color: ink }]}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: paper },
  bar56: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, gap: 2 },
  barIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  selCount: { flex: 1, fontSize: 18, fontFamily: font.semibold, color: ink, marginLeft: 8, ...tight(18) },
  titleBlock: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 },
  title: { fontSize: 34, lineHeight: 39, fontFamily: font.semibold, color: ink, letterSpacing: -0.035 * 34 },
  subtitle: { fontSize: 15, fontFamily: font.regular, color: ink3, marginTop: 4 },
  header: { height: HEADER_H, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, backgroundColor: paper },
  headerLabel: { flex: 1, fontSize: 17, fontFamily: font.semibold, color: ink, ...tight(17) },
  headerCount: { fontSize: 14, fontFamily: font.regular, color: ink3 },
  dayCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: ink3, alignItems: "center", justifyContent: "center" },
  dayCircleOn: { backgroundColor: ink, borderColor: ink },
  sticky: { position: "absolute", left: 0, right: 0, top: 0 },
  gridRow: { flexDirection: "row", gap: GAP },
  handleWrap: { position: "absolute", right: 0, top: 0, height: HANDLE_H, flexDirection: "row-reverse", alignItems: "center" },
  handle: { width: 28, height: HANDLE_H, borderTopLeftRadius: 14, borderBottomLeftRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderRightWidth: 0, borderColor: line, alignItems: "center", justifyContent: "center", gap: 4, elevation: 3, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  grip: { width: 10, height: 1.5, borderRadius: 1, backgroundColor: ink3 },
  bubble: { marginRight: 10, backgroundColor: ink, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleText: { color: "#fff", fontSize: 16, fontFamily: font.semibold, ...tight(16) },
  foot: { position: "absolute", left: 16, right: 16, bottom: 0, gap: 12 },
  selBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", justifyContent: "space-around", paddingTop: 8, backgroundColor: paper, borderTopWidth: 1, borderTopColor: line },
  bottomAction: { alignItems: "center", gap: 4, minWidth: 88, paddingVertical: 6 },
  bottomLabel: { fontSize: 13, fontFamily: font.regular, color: ink2 },
  quiet: { paddingHorizontal: 20, paddingTop: 12, gap: 14 },
  quietLine: { fontSize: 16, lineHeight: 22, fontFamily: font.regular, color: ink2 },
  empty: { paddingHorizontal: 20, paddingTop: 36 },
  emptyTitle: { fontSize: 26, lineHeight: 31, fontFamily: font.semibold, color: ink, ...tight(26) },
  emptyLine: { fontSize: 16, lineHeight: 23, fontFamily: font.regular, color: ink2, marginTop: 8 },
  skelBar: { height: 12, borderRadius: 6, backgroundColor: line },
  viewerAction: { alignItems: "center", gap: 4, minWidth: 80, paddingVertical: 4 },
  viewerLabel: { color: "#fff", fontSize: 13, fontFamily: font.regular },
  infoLine: { paddingHorizontal: 16, paddingVertical: 8 },
  infoLabel: { fontSize: 13, fontFamily: font.regular, color: ink3, marginBottom: 2 },
  infoValue: { fontSize: 16, fontFamily: font.regular, color: ink2 },
});

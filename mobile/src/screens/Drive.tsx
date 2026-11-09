// My drive (docs/phone/02-my-drive.md). Each folder is a screen on the stack, titled with its
// name; the back gesture goes up one level. Long-press selects and swaps the top bar for the
// selection's actions; the + opens a sheet to add; pictures open full screen, other files in
// the app the phone picks. Everything reads from one shared store (../drive/store), so a
// change made in one folder shows in every screen beneath it.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, FlatList, Linking, Platform, Pressable, RefreshControl, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { useFocusEffect, useNavigation, usePreventRemove, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { ArrowLeft, Check, ChevronRight, Copy, Download, Ellipsis, FolderInput, FolderPlus, Image as ImageIcon, Link2, Link2Off, ListChecks, Pencil, Plus, Search, Share2, Smartphone, Trash2, Upload as UploadIcon, X } from "lucide-react-native";
import { Button, Field, font, ink, ink2, ink3, line, paper, tight } from "../ui";
import { useSession } from "../session";
import type { FileRow } from "../api";
import { backupNews, copyNews } from "../events";
import type { CopyState } from "../drivecopy";
import * as drive from "../drive/store";
import { FolderLeading, Leading, LEAD, Name, Ring, Sheet, SheetItem, SheetLine, Skeleton, Snackbar, ThinLine } from "../drive/parts";
import { Lightbox } from "../drive/Lightbox";

type Params = { folder?: string } | undefined;
type Nav = NativeStackNavigationProp<Record<string, object | undefined>>;

type Row = { kind: "folder"; path: string; count: number; where?: string } | { kind: "file"; f: FileRow; where?: string } | { kind: "upload"; u: drive.Upload };
const keyOf = (r: Row) => (r.kind === "folder" ? "d:" + r.path : r.kind === "file" ? r.f.id : "u:" + r.u.id);

export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
const fmtDate = (t: number) => {
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
};
const pathLine = (p: string) => (p ? p.split("/").join(" / ") : "My drive");
const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString()} ${n === 1 ? one : many}`;

let savedDir: string | null = null; // where "Save to phone" wrote last, for this session

export function DriveScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<Record<string, Params>, string>>();
  const folder = route.params?.folder ?? "";
  const root = folder === "";
  const { cfg } = useSession();
  const st = drive.useDrive();
  const insets = useSafeAreaInsets();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState<string | null>(null); // null: not searching
  const [sheet, setSheet] = useState<null | "add" | "folder" | "more" | "rename" | "link">(null);
  const [lightbox, setLightbox] = useState<{ items: FileRow[]; start: number } | null>(null);
  const [copy, setCopy] = useState<CopyState | null>(copyNews.get());
  const [copyDoneHidden, setCopyDoneHidden] = useState(false);
  const [focused, setFocused] = useState(true);
  const selecting = selected.size > 0;
  const searching = query !== null;

  useEffect(() => {
    if (cfg?.token) drive.startDrive(cfg);
  }, [cfg]);
  useEffect(() => copyNews.on(setCopy), []);
  // Phone photos fills in as each backup upload finishes.
  useEffect(() => backupNews.on((n) => n.last && drive.addFile(n.last)), []);

  // A change check on open, on focus and every minute while open (every 10 s while this phone sends).
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      drive.check();
      let t: ReturnType<typeof setInterval>;
      let fast: boolean | null = null;
      const arm = () => {
        const sending = backupNews.get().sending;
        if (sending === fast) return; // only re-time when the phone starts or stops sending
        fast = sending;
        clearInterval(t);
        t = setInterval(() => drive.check(), sending ? 10_000 : 60_000);
      };
      arm();
      const offNews = backupNews.on(arm);
      const app = AppState.addEventListener("change", (s) => s === "active" && drive.check());
      return () => {
        setFocused(false);
        clearInterval(t);
        offNews();
        app.remove();
      };
    }, []),
  );

  // Back clears the selection, then the search, before it leaves the folder.
  const clearMode = useCallback(() => {
    if (selected.size) setSelected(new Set());
    else if (query !== null) setQuery(null);
  }, [selected, query]);
  usePreventRemove(selecting || searching, clearMode);
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!selecting && !searching) return false;
        clearMode();
        return true;
      });
      return () => sub.remove();
    }, [selecting, searching, clearMode]),
  );

  // The toast clears itself; only the screen in front shows it.
  useEffect(() => {
    if (!st.toast) return;
    const t = setTimeout(drive.clearToast, st.toast.ms - (Date.now() - st.toast.at));
    return () => clearTimeout(t);
  }, [st.toast]);

  // --- Rows

  const rows: Row[] = useMemo(() => {
    const files = st.files ?? [];
    if (searching) {
      const q = (query ?? "").trim().toLowerCase();
      if (!q) return [];
      const folders = drive.allFolders(files, st.folders).filter((p) => drive.nameOf(p).toLowerCase().includes(q));
      const view = (p: string) => drive.folderView(files, st.folders, p);
      return [
        ...folders.sort((a, b) => drive.nameOf(a).localeCompare(drive.nameOf(b))).map((p) => ({ kind: "folder" as const, path: p, count: view(p).folders.length + view(p).files.length, where: pathLine(drive.parentOf(p)) })),
        ...files
          .filter((f) => f.name.toLowerCase().includes(q))
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 300)
          .map((f) => ({ kind: "file" as const, f, where: pathLine(f.folder) })),
      ];
    }
    const v = drive.folderView(files, st.folders, folder);
    return [...v.folders.map((x) => ({ kind: "folder" as const, ...x })), ...st.uploads.filter((u) => u.folder === folder).map((u) => ({ kind: "upload" as const, u })), ...v.files.map((f) => ({ kind: "file" as const, f }))];
  }, [st.files, st.folders, st.uploads, folder, searching, query]);

  const selFiles = useMemo(() => (st.files ?? []).filter((f) => selected.has(f.id)), [st.files, selected]);
  const one = selected.size === 1 && selFiles.length === 1 ? selFiles[0] : null; // exactly one file
  const onlyFiles = selFiles.length === selected.size;
  const locked = st.who?.protection === "passcode";
  const off = st.offline;

  // --- Actions

  function toggle(k: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }
  function longPress(k: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    toggle(k);
  }

  async function open(f: FileRow) {
    if (drive.isPicture(f)) {
      const pics = rows.filter((r): r is Extract<Row, { kind: "file" }> => r.kind === "file" && drive.isPicture(r.f)).map((r) => r.f);
      return setLightbox({ items: pics, start: Math.max(0, pics.findIndex((x) => x.id === f.id)) });
    }
    if (st.opening) return;
    drive.setOpening(f.id);
    try {
      const uri = await drive.plainFile(f);
      await Sharing.shareAsync(uri, { mimeType: f.mime, dialogTitle: "Open with" });
    } catch {
      drive.toast(`Couldn't open ${f.name}.`, { label: "Retry", run: () => open(f) }, 8000);
    } finally {
      drive.setOpening(null);
    }
  }

  async function saveToPhone(files: FileRow[]) {
    setSheet(null);
    if (Platform.OS !== "android") {
      if (files[0]) Sharing.shareAsync(await drive.plainFile(files[0]), { mimeType: files[0].mime }).catch(() => {});
      return;
    }
    const SAF = FileSystem.StorageAccessFramework;
    try {
      if (!savedDir) {
        const p = await SAF.requestDirectoryPermissionsAsync();
        if (!p.granted) return;
        savedDir = p.directoryUri;
      }
      let n = 0;
      for (const f of files) {
        const src = await drive.plainFile(f);
        const dest = await SAF.createFileAsync(savedDir, f.name, f.mime || "application/octet-stream");
        await FileSystem.writeAsStringAsync(dest, await FileSystem.readAsStringAsync(src, { encoding: FileSystem.EncodingType.Base64 }), { encoding: FileSystem.EncodingType.Base64 });
        n++;
      }
      drive.toast(n === 1 ? `Saved ${files[0].name} to your phone.` : `Saved ${n.toLocaleString()} files to your phone.`);
    } catch {
      savedDir = null;
      drive.toast(files.length === 1 ? `Couldn't save ${files[0].name}.` : "Couldn't save those files.");
    }
    setSelected(new Set());
  }

  async function pick(kind: "files" | "media") {
    setSheet(null);
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: kind === "media" ? ["image/*", "video/*"] : "*/*" }).catch(() => null);
    if (!r || r.canceled) return;
    drive.enqueueUploads(
      r.assets.map((a) => ({ uri: a.uri, name: a.name, mime: a.mimeType ?? "application/octet-stream", size: a.size ?? 0 })),
      folder,
    );
  }

  function trashSelected() {
    drive.trash([...selected]);
    setSelected(new Set());
  }

  function move() {
    nav.navigate("DriveMove", { keys: [...selected], from: folder });
    setSelected(new Set());
  }

  // --- Render

  const title = root ? "My drive" : drive.nameOf(folder);
  const usage = st.who ? `${plural(st.who.fileCount, "file")} · ${fmtBytes(st.who.bytes)}` : "";
  const copying = copy && (copy.phase === "scanning" || copy.phase === "copying");
  const setupOpen = root && !st.setupHidden && !cfg?.setup?.moved && st.who && !st.who.googleConnected && (st.files?.length ?? 0) > 0;
  const emptyDrive = st.status === "ready" && (st.files?.length ?? 0) === 0 && st.folders.length === 0 && st.uploads.length === 0;

  const header = (
    <View>
      {!searching && (
        <View style={s.titleBlock}>
          <Text style={s.title} numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
          {root && !!usage && <Text style={s.subtitle}>{usage}</Text>}
        </View>
      )}
      {off && <Text style={s.strip}>Offline. Showing your drive as it was last time.</Text>}
      {root && !searching && copying && copy && (
        <Pressable style={s.stripBox} onPress={() => nav.navigate("Steps", { step: 2 })}>
          <Text style={s.stripText}>{copy.phase === "scanning" ? "Looking through your Google Drive…" : `Copying from Google Drive · ${(copy.copied + copy.failed).toLocaleString()} of ${copy.total.toLocaleString()}`}</Text>
          <View style={s.bar}>
            <View style={[s.fill, { width: `${copy.total ? Math.round(((copy.copied + copy.failed) / copy.total) * 100) : 4}%` }]} />
          </View>
        </Pressable>
      )}
      {root && !searching && copy?.phase === "done" && !copyDoneHidden && (
        <View style={[s.stripBox, s.stripRow]}>
          <Text style={[s.stripText, { flex: 1 }]}>Your Google Drive is here.</Text>
          <Pressable hitSlop={8} onPress={() => Linking.openURL("https://one.google.com/storage")}>
            <Text style={s.stripAction}>Cancel Google One</Text>
          </Pressable>
          <Pressable hitSlop={10} onPress={() => setCopyDoneHidden(true)} accessibilityLabel="Hide">
            <X size={18} color={ink3} />
          </Pressable>
        </View>
      )}
      {!searching && setupOpen && (
        <View style={[s.stripBox, s.stripRow]}>
          <Pressable style={{ flex: 1 }} onPress={() => nav.navigate("Steps", { step: 2 })}>
            <Text style={s.stripText}>Move my files here</Text>
            <Text style={s.stripNote}>Everything from Google Drive, folders included.</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={drive.hideSetup}>
            <Text style={s.stripHide}>Hide</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  let empty: React.ReactNode = null;
  if (st.status === "loading" && !st.files) empty = <Skeleton />;
  else if (st.status === "error") empty = <Quiet line="Couldn’t reach Stash. Check your connection." action={<Button title="Try again" kind="outline" onPress={() => drive.refresh().catch(() => {})} />} />;
  else if (searching) empty = query?.trim() ? <Quiet line={`Nothing matches “${query.trim()}”.`} /> : null;
  else if (root && emptyDrive)
    empty = (
      <View style={s.emptyRoot}>
        <Text style={s.emptyTitle}>Your drive is empty.</Text>
        <Text style={s.emptyLine}>Everything is encrypted before it is stored.</Text>
        <View style={{ gap: 4, marginTop: 24 }}>
          <Button title="Move my files here" onPress={() => nav.navigate("Steps", { step: 2 })} />
          <Button title="Add a file" kind="text" onPress={() => setSheet("add")} />
        </View>
      </View>
    );
  else if (!root) empty = <Quiet line="This folder is empty." action={<Button title="Add a file" kind="text" onPress={() => setSheet("add")} />} />;

  return (
    <SafeAreaView style={s.page} edges={["top", "left", "right"]}>
      <TopBar
        root={root}
        selecting={selecting}
        count={selected.size}
        query={query}
        setQuery={setQuery}
        onBack={() => nav.goBack()}
        onSearch={() => setQuery("")}
        onClear={() => setSelected(new Set())}
        actions={
          <>
            {one && !locked && <BarIcon icon={Link2} label="Get link" disabled={off} onPress={() => setSheet("link")} />}
            <BarIcon icon={FolderInput} label="Move" disabled={off} onPress={move} />
            <BarIcon icon={Trash2} label="Trash" disabled={off} onPress={trashSelected} />
            <BarIcon icon={Ellipsis} label="More" onPress={() => setSheet("more")} />
          </>
        }
      />
      <ThinLine on={st.checking} />
      <FlatList
        data={st.status === "error" && !st.files ? [] : rows}
        keyExtractor={keyOf}
        ListHeaderComponent={header}
        ListEmptyComponent={empty ? <>{empty}</> : null}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} colors={[ink]} onRefresh={() => drive.refresh().catch(() => drive.toast("Couldn’t reach Stash. Check your connection."))} />}
        extraData={[selected, st.kept, st.opening]}
        renderItem={({ item }) => {
          const k = keyOf(item);
          const on = selected.has(k);
          if (item.kind === "upload") return <UploadRow u={item.u} />;
          if (item.kind === "folder")
            return (
              <RowShell
                selected={on}
                lead={<FolderLeading />}
                name={drive.nameOf(item.path)}
                meta={item.where ?? (item.count ? plural(item.count, "item") : "Empty")}
                trailing={!selecting ? <ChevronRight size={18} color={faintIcon} /> : null}
                onPress={() => (selecting ? toggle(k) : nav.push("Drive", { folder: item.path }))}
                onLongPress={() => !searching && longPress(k)}
              />
            );
          const f = item.f;
          return (
            <RowShell
              selected={on}
              lead={<Leading f={f} />}
              name={f.name}
              meta={item.where ?? `${fmtDate(f.modifiedAt ?? f.createdAt)} · ${fmtBytes(f.size)}`}
              busy={st.opening === f.id}
              trailing={st.kept.has(f.id) ? <Check size={18} color={ink2} accessibilityLabel="Kept on this phone" /> : null}
              onPress={() => (selecting ? toggle(k) : open(f))}
              onLongPress={() => !searching && longPress(k)}
            />
          );
        }}
      />

      {/* Foot: the + and the message, the message under the button so neither covers the other. */}
      {focused && (
        <View pointerEvents="box-none" style={[s.foot, { paddingBottom: 16 + insets.bottom }]}>
          {!selecting && !searching && st.status !== "error" && (
            <Animated.View layout={LinearTransition.duration(200)} style={{ alignSelf: "flex-end" }}>
              <Pressable style={({ pressed }) => [s.fab, pressed && { opacity: 0.85 }]} onPress={() => setSheet("add")} accessibilityLabel="Add">
                <Plus size={26} color="#fff" strokeWidth={2} />
              </Pressable>
            </Animated.View>
          )}
          {st.toast && <Snackbar text={st.toast.text} action={st.toast.action?.label} onAction={st.toast.action?.run} />}
        </View>
      )}

      <Sheet visible={sheet === "add"} onClose={() => setSheet(null)}>
        <SheetItem icon={UploadIcon} label="Upload files" onPress={() => pick("files")} />
        <SheetItem icon={ImageIcon} label="Upload photos or videos" onPress={() => pick("media")} />
        <SheetItem icon={FolderPlus} label="New folder" onPress={() => setSheet("folder")} />
      </Sheet>
      <NameSheet
        visible={sheet === "folder"}
        title="New folder"
        placeholder="Folder name"
        action="Create"
        onClose={() => setSheet(null)}
        onSubmit={async (name) => {
          const p = await drive.newFolder(folder, name);
          setSheet(null);
          if (p) nav.push("Drive", { folder: p });
        }}
      />
      <Sheet visible={sheet === "more"} onClose={() => setSheet(null)}>
        {onlyFiles && <SheetItem icon={Download} label="Save to phone" disabled={!selFiles.length} onPress={() => saveToPhone(selFiles)} />}
        {one && <SheetItem icon={Pencil} label="Rename" disabled={off} onPress={() => setSheet("rename")} />}
        {onlyFiles && selFiles.length > 0 && (selFiles.every((f) => st.kept.has(f.id)) ? (
          <SheetItem
            icon={Smartphone}
            label="Remove from this phone"
            onPress={() => {
              selFiles.forEach(drive.unkeep);
              setSheet(null);
              setSelected(new Set());
            }}
          />
        ) : (
          <SheetItem
            icon={Smartphone}
            label="Keep on this phone"
            disabled={off && selFiles.some((f) => !st.kept.has(f.id))}
            onPress={() => {
              const list = selFiles.filter((f) => !st.kept.has(f.id));
              setSheet(null);
              setSelected(new Set());
              Promise.all(list.map(drive.keep)).then(() => drive.toast(list.length === 1 ? `${list[0].name} is kept on this phone.` : `${list.length.toLocaleString()} files are kept on this phone.`));
            }}
          />
        ))}
        <SheetItem
          icon={ListChecks}
          label="Select all"
          onPress={() => {
            setSelected(new Set(rows.filter((r) => r.kind !== "upload").map(keyOf)));
            setSheet(null);
          }}
        />
      </Sheet>
      {one && (
        <NameSheet
          visible={sheet === "rename"}
          title="Rename"
          initial={one.name}
          action="Rename"
          onClose={() => setSheet(null)}
          onSubmit={(name) => {
            const dot = one.name.lastIndexOf(".");
            const ext = dot > 0 ? one.name.slice(dot) : "";
            const next = ext && !name.toLowerCase().endsWith(ext.toLowerCase()) ? name + ext : name;
            setSheet(null);
            setSelected(new Set());
            if (next !== one.name) drive.rename(one, next);
          }}
        />
      )}
      {one && sheet === "link" && <LinkSheet f={one} onClose={() => setSheet(null)} />}
      {lightbox && <Lightbox items={lightbox.items} start={lightbox.start} onClose={() => setLightbox(null)} />}
    </SafeAreaView>
  );
}

const faintIcon = "#c4c4c4";

// --- Top bar: back and search; while selecting, the count and its actions; while searching, the field.

function TopBar(p: { root: boolean; selecting: boolean; count: number; query: string | null; setQuery: (q: string | null) => void; onBack: () => void; onSearch: () => void; onClear: () => void; actions: React.ReactNode }) {
  if (p.selecting)
    return (
      <Animated.View entering={FadeIn.duration(140)} style={s.bar56}>
        <BarIcon icon={X} label="Clear selection" onPress={p.onClear} />
        <Text style={s.selCount}>{p.count.toLocaleString()} selected</Text>
        {p.actions}
      </Animated.View>
    );
  if (p.query !== null)
    return (
      <Animated.View entering={FadeIn.duration(140)} style={s.bar56}>
        <BarIcon icon={ArrowLeft} label="Back" onPress={() => p.setQuery(null)} />
        <TextInput value={p.query} onChangeText={p.setQuery} placeholder="Search" placeholderTextColor={ink3} autoFocus returnKeyType="search" style={s.search} autoCorrect={false} />
        {!!p.query && <BarIcon icon={X} label="Clear" onPress={() => p.setQuery("")} />}
      </Animated.View>
    );
  return (
    <View style={s.bar56}>
      {!p.root ? <BarIcon icon={ArrowLeft} label="Back" onPress={p.onBack} /> : <View style={{ width: 8 }} />}
      <View style={{ flex: 1 }} />
      <BarIcon icon={Search} label="Search" onPress={p.onSearch} />
    </View>
  );
}

function BarIcon({ icon: I, label, onPress, disabled = false }: { icon: typeof X; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={4} accessibilityLabel={label} accessibilityRole="button" style={({ pressed }) => [s.barIcon, pressed && { backgroundColor: "#ececec" }, disabled && { opacity: 0.35 }]}>
      <I size={22} color={ink} strokeWidth={1.8} />
    </Pressable>
  );
}

// --- Rows

function RowShell({ selected, lead, name, meta, trailing, busy, onPress, onLongPress }: { selected: boolean; lead: React.ReactNode; name: string; meta: string; trailing?: React.ReactNode; busy?: boolean; onPress: () => void; onLongPress: () => void }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={320} style={({ pressed }) => [s.row, selected && s.rowOn, pressed && !selected && { backgroundColor: "#f0f0f0" }]} accessibilityState={{ selected }}>
      {selected ? (
        <View style={s.lead}>
          <View style={s.tick}>
            <Check size={18} color="#fff" strokeWidth={2.4} />
          </View>
        </View>
      ) : busy ? (
        <View style={s.lead}>
          <ActivityIndicator color={ink} />
        </View>
      ) : (
        lead
      )}
      <View style={s.rowText}>
        <Name name={name} />
        <Text style={s.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {trailing}
    </Pressable>
  );
}

function UploadRow({ u }: { u: drive.Upload }) {
  return (
    <View style={s.row}>
      <View style={s.lead}>{u.state === "failed" ? <X size={22} color={ink2} /> : <Ring progress={u.progress} />}</View>
      <View style={s.rowText}>
        <Name name={u.name} />
        <Text style={s.meta} numberOfLines={1}>
          {u.state === "failed" ? u.note : u.state === "waiting" ? (drive.driveState().offline ? "Waits for a connection." : "Waiting…") : `Sending · ${Math.round(u.progress * 100)}%`}
        </Text>
      </View>
      {u.state === "failed" && (
        <Pressable hitSlop={10} onPress={() => drive.retryUpload(u.id)}>
          <Text style={s.retry}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

function Quiet({ line: text, action }: { line: string; action?: React.ReactNode }) {
  return (
    <View style={s.quiet}>
      <Text style={s.quietLine}>{text}</Text>
      {action}
    </View>
  );
}

// --- Sheets with a field: new folder, rename (the name selected, the extension kept).

function NameSheet({ visible, title, initial = "", placeholder, action, onClose, onSubmit }: { visible: boolean; title: string; initial?: string; placeholder?: string; action: string; onClose: () => void; onSubmit: (name: string) => void | Promise<void> }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ref = useRef<TextInput>(null);
  useEffect(() => {
    if (!visible) return;
    setV(initial);
    const dot = initial.lastIndexOf(".");
    const end = dot > 0 ? dot : initial.length;
    const t = setTimeout(() => {
      ref.current?.focus();
      ref.current?.setSelection?.(0, end);
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
      <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
        <Field ref={ref} value={v} onChangeText={setV} placeholder={placeholder} autoCorrect={false} returnKeyType="done" onSubmitEditing={submit} />
        <Button title={action} onPress={submit} busy={busy} disabled={!v.trim()} />
      </View>
    </Sheet>
  );
}

// --- Get link: made when the sheet opens; copy, share, or remove it.

function LinkSheet({ f, onClose }: { f: FileRow; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    drive
      .linkFor(f)
      .then(setUrl)
      .catch((e: Error & { status?: number }) => setError(e.status === 401 ? "Links are made on the website for now." : e.status === 409 ? e.message : "Couldn’t make a link. Try again."));
  }, [f]);
  return (
    <Sheet visible onClose={onClose} title={f.name}>
      <SheetLine>{error ?? `Anyone with the link can download ${f.name}. Remove it any time.`}</SheetLine>
      {!error && (
        <>
          <SheetItem
            icon={Copy}
            label="Copy link"
            disabled={!url}
            onPress={async () => {
              if (!url) return;
              await Clipboard.setStringAsync(url);
              onClose();
              drive.toast("Link copied.");
            }}
          />
          <SheetItem icon={Share2} label="Share link" disabled={!url} onPress={() => url && Share.share({ message: url }).then(onClose)} />
          <SheetItem
            icon={Link2Off}
            label="Remove link"
            disabled={!url || busy}
            onPress={async () => {
              setBusy(true);
              try {
                await drive.unlink(f);
                onClose();
                drive.toast("Link removed.");
              } catch {
                setError("Couldn’t remove the link. Try again.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: paper },
  bar56: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, gap: 2 },
  barIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  selCount: { flex: 1, fontSize: 18, fontFamily: font.semibold, color: ink, marginLeft: 8, ...tight(18) },
  search: { flex: 1, fontSize: 18, fontFamily: font.regular, color: ink, paddingVertical: 8, paddingHorizontal: 8 },
  titleBlock: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14 },
  title: { fontSize: 34, lineHeight: 39, fontFamily: font.semibold, color: ink, letterSpacing: -0.035 * 34 },
  subtitle: { fontSize: 15, fontFamily: font.regular, color: ink3, marginTop: 4 },
  strip: { fontSize: 14, lineHeight: 19, fontFamily: font.regular, color: ink2, paddingHorizontal: 20, paddingBottom: 12 },
  stripBox: { marginHorizontal: 20, marginBottom: 14, paddingVertical: 12 },
  stripRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  stripText: { fontSize: 15, fontFamily: font.medium, color: ink, marginBottom: 8 },
  stripNote: { fontSize: 14, fontFamily: font.regular, color: ink3, marginTop: -4 },
  stripAction: { fontSize: 15, fontFamily: font.medium, color: ink, textDecorationLine: "underline" },
  stripHide: { fontSize: 15, fontFamily: font.regular, color: ink2 },
  bar: { height: 3, borderRadius: 2, backgroundColor: line, overflow: "hidden" },
  fill: { height: 3, backgroundColor: ink },
  row: { flexDirection: "row", alignItems: "center", gap: 16, height: 64, paddingHorizontal: 20, backgroundColor: paper },
  rowOn: { backgroundColor: "#ececec" },
  lead: { width: LEAD, height: LEAD, alignItems: "center", justifyContent: "center" },
  tick: { width: 28, height: 28, borderRadius: 14, backgroundColor: ink, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0 },
  meta: { fontSize: 14, lineHeight: 19, fontFamily: font.regular, color: ink3, marginTop: 1 },
  retry: { fontSize: 15, fontFamily: font.semibold, color: ink },
  foot: { position: "absolute", left: 16, right: 16, bottom: 0, gap: 12 },
  fab: { width: 58, height: 58, borderRadius: 29, backgroundColor: ink, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  quiet: { paddingHorizontal: 20, paddingTop: 12, gap: 14 },
  quietLine: { fontSize: 16, lineHeight: 22, fontFamily: font.regular, color: ink2 },
  emptyRoot: { paddingHorizontal: 20, paddingTop: 36 },
  emptyTitle: { fontSize: 26, lineHeight: 31, fontFamily: font.semibold, color: ink, ...tight(26) },
  emptyLine: { fontSize: 16, lineHeight: 23, fontFamily: font.regular, color: ink2, marginTop: 8 },
});

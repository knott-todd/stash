// My drive, first native cut: the list, folders as a stack, pull to refresh. The full
// screen per docs/phone/02-my-drive.md comes next; this is the landing after setup.
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronRight, File, FileImage, FileText, FileVideo, Folder } from "lucide-react-native";
import { Brand, ink, ink2, ink3, line, paper } from "../ui";
import { useSession } from "../session";
import { listFiles, me, type FileRow } from "../api";

type Nav = NativeStackNavigationProp<Record<string, undefined | { folder: string }>>;

const icon = (f: FileRow) => (f.mime.startsWith("image/") ? FileImage : f.mime.startsWith("video/") ? FileVideo : f.mime.startsWith("text/") || f.mime.includes("pdf") ? FileText : File);
const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function DriveScreen(props: unknown) {
  const { route } = props as { route: { params?: { folder?: string } } };
  const nav = useNavigation<Nav>();
  const { cfg } = useSession();
  const folder = route.params?.folder ?? "";
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [usage, setUsage] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!cfg) return;
    try {
      const [list, w] = await Promise.all([listFiles(cfg), me(cfg)]);
      setFiles(list);
      setUsage(`${(w.fileCount ?? list.length).toLocaleString()} files · ${fmtBytes(w.bytes ?? 0)}`);
    } catch {}
  }, [cfg]);
  useEffect(() => {
    load();
  }, [load]);

  // Rows for this folder: subfolders first, then files, as the web does.
  const subs = new Map<string, number>();
  const here: FileRow[] = [];
  for (const f of files ?? []) {
    if (f.folder === folder) here.push(f);
    else if (!folder || f.folder.startsWith(folder + "/")) {
      const rest = folder ? f.folder.slice(folder.length + 1) : f.folder;
      const head = rest.split("/")[0];
      if (head) subs.set(head, (subs.get(head) ?? 0) + 1);
    }
  }
  type Row = { kind: "folder"; name: string; count: number } | { kind: "file"; f: FileRow };
  const rows: Row[] = [...[...subs.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ kind: "folder" as const, name, count })), ...here.sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({ kind: "file" as const, f }))];

  return (
    <View style={s.page}>
      <View style={s.head}>
        {folder ? <Text style={s.title}>{folder.split("/").pop()}</Text> : <Brand />}
        {!folder && !!usage && <Text style={s.usage}>{usage}</Text>}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === "folder" ? "d:" + r.name : r.f.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={files ? <Text style={s.empty}>{folder ? "This folder is empty." : "Your drive is empty."}</Text> : null}
        renderItem={({ item }) => {
          if (item.kind === "folder")
            return (
              <Pressable style={s.row} onPress={() => nav.push("Drive", { folder: folder ? `${folder}/${item.name}` : item.name })}>
                <Folder size={22} color={ink2} strokeWidth={1.6} />
                <View style={s.rowText}>
                  <Text style={s.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={s.meta}>{item.count.toLocaleString()} items</Text>
                </View>
                <ChevronRight size={18} color={ink3} />
              </Pressable>
            );
          const I = icon(item.f);
          return (
            <View style={s.row}>
              <I size={22} color={ink2} strokeWidth={1.6} />
              <View style={s.rowText}>
                <Text style={s.name} numberOfLines={1}>
                  {item.f.name}
                </Text>
                <Text style={s.meta}>
                  {fmtDate(item.f.modifiedAt ?? item.f.createdAt)} · {item.f.size === 0 ? "Empty" : fmtBytes(item.f.size)}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: paper },
  head: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 6 },
  title: { fontSize: 24, fontWeight: "600", color: ink, marginBottom: 8 },
  usage: { fontSize: 13, color: ink3, marginTop: -16, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: line, backgroundColor: paper },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, color: ink, fontWeight: "500" },
  meta: { fontSize: 13, color: ink3, marginTop: 2 },
  empty: { padding: 24, color: ink3, fontSize: 15 },
});

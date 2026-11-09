// Move: a full-screen picker with its own stack of folders. Tapping a folder goes into it;
// back comes up one level, then closes. The button names where things will land.
// (docs/phone/02-my-drive.md, "Actions".)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, usePreventRemove, useRoute, type RouteProp } from "@react-navigation/native";
import { ArrowLeft, ChevronRight, FolderPlus, X } from "lucide-react-native";
import { Button, Field, font, ink, ink3, paper, tight } from "../ui";
import * as drive from "../drive/store";
import { FolderLeading, Sheet } from "../drive/parts";

type Params = { keys: string[]; from: string };

export function MovePickerScreen() {
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<Record<string, Params>, string>>();
  const keys = params?.keys ?? [];
  const st = drive.useDrive();
  const [path, setPath] = useState(params?.from ?? "");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  // Folders being moved cannot take themselves in.
  const moving = useMemo(() => keys.filter((k) => k.startsWith("d:")).map((k) => k.slice(2)), [keys]);
  const subs = useMemo(() => drive.folderView(st.files ?? [], st.folders, path).folders.filter((f) => !moving.some((d) => f.path === d || f.path.startsWith(d + "/"))), [st.files, st.folders, path, moving]);

  // Already here: every file is in this folder already, and every folder's parent is this one.
  const already = useMemo(() => {
    const files = (st.files ?? []).filter((f) => keys.includes(f.id));
    return files.every((f) => f.folder === path) && moving.every((d) => drive.parentOf(d) === path);
  }, [st.files, keys, moving, path]);

  const up = useCallback(() => setPath((p) => drive.parentOf(p)), []);
  // Moving closes the picker; until then back goes up a level.
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (leaving) nav.goBack();
  }, [leaving, nav]);
  usePreventRemove(path !== "" && !leaving, up);
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!path) return false;
        up();
        return true;
      });
      return () => sub.remove();
    }, [path, up]),
  );

  const where = path ? drive.nameOf(path) : "My drive";
  const count = keys.length;
  return (
    <SafeAreaView style={s.page}>
      <View style={s.bar}>
        <Pressable style={s.icon} hitSlop={4} accessibilityLabel={path ? "Back" : "Close"} onPress={() => (path ? up() : nav.goBack())}>
          {path ? <ArrowLeft size={22} color={ink} /> : <X size={22} color={ink} />}
        </Pressable>
        <Text style={s.barTitle}>{count === 1 ? "Move 1 item" : `Move ${count.toLocaleString()} items`}</Text>
        <Pressable style={s.icon} hitSlop={4} accessibilityLabel="New folder" onPress={() => (setName(""), setNaming(true))}>
          <FolderPlus size={22} color={ink} />
        </Pressable>
      </View>
      <Text style={s.title} numberOfLines={2}>
        {where}
      </Text>
      <FlatList
        data={subs}
        keyExtractor={(x) => x.path}
        ListEmptyComponent={<Text style={s.empty}>No folders in here.</Text>}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [s.row, pressed && { backgroundColor: "#f0f0f0" }]} onPress={() => setPath(item.path)}>
            <FolderLeading />
            <Text style={s.name} numberOfLines={1}>
              {drive.nameOf(item.path)}
            </Text>
            <ChevronRight size={18} color="#c4c4c4" />
          </Pressable>
        )}
      />
      <View style={s.foot}>
        <Button
          title={already ? "Already here" : `Move to ${where}`}
          disabled={already || st.offline}
          onPress={() => {
            setLeaving(true);
            drive.move(keys, path);
          }}
        />
      </View>
      <Sheet visible={naming} onClose={() => setNaming(false)} title="New folder">
        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          <Field value={name} onChangeText={setName} placeholder="Folder name" autoFocus autoCorrect={false} returnKeyType="done" />
          <Button
            title="Create"
            disabled={!name.trim()}
            onPress={async () => {
              const p = await drive.newFolder(path, name);
              setNaming(false);
              if (p) setPath(p);
            }}
          />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: paper },
  bar: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  barTitle: { flex: 1, fontSize: 18, fontFamily: font.semibold, color: ink, marginLeft: 8, ...tight(18) },
  title: { fontSize: 34, lineHeight: 39, fontFamily: font.semibold, color: ink, letterSpacing: -0.035 * 34, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 16, height: 64, paddingHorizontal: 20 },
  name: { flex: 1, fontSize: 16, fontFamily: font.medium, color: ink, minWidth: 0 },
  empty: { fontSize: 16, fontFamily: font.regular, color: ink3, paddingHorizontal: 20, paddingTop: 8 },
  foot: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20 },
});


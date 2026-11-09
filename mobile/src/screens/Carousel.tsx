// First open: the landing page as four swiped slides. The last one is the call to action.
import React, { useRef, useState } from "react";
import { Dimensions, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, ink, ink2, ink3, line, P, Screen } from "../ui";
import { useSession } from "../session";

const slides = [
  { h: "Free.", p: "There is no plan to upgrade to. No tiers, no trial, no card." },
  { h: "Unlimited.", p: "No quota. You will never see “storage full” again." },
  { h: "Private.", p: "Every file is encrypted before it is stored. Only you, signed in, can open your files." },
];

export function CarouselScreen() {
  const nav = useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();
  const { cfg, update, setExisting } = useSession();
  const width = Dimensions.get("window").width;
  const list = useRef<FlatList>(null);
  const [i, setI] = useState(cfg?.setup?.seenCarousel ? 3 : 0);
  const go = (n: number) => {
    list.current?.scrollToIndex({ index: n, animated: true });
    setI(n);
  };
  const start = async (existing: boolean) => {
    await update((c) => ({ ...c, setup: { ...(c.setup ?? {}), seenCarousel: true } }));
    setExisting(existing);
    nav.navigate("SignIn");
  };
  const last = i === 3;
  return (
    <Screen scroll={false}>
      {!last && (
        <Pressable style={s.skip} onPress={() => go(3)} hitSlop={10}>
          <Text style={s.skipText}>Skip</Text>
        </Pressable>
      )}
      <FlatList
        ref={list}
        data={[...slides, { h: "", p: "" }]}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={i}
        getItemLayout={(_, n) => ({ length: width, offset: width * n, index: n })}
        onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}
        keyExtractor={(_, n) => String(n)}
        renderItem={({ item, index }) => (
          <View style={[s.slide, { width }]}>
            {index < 3 ? (
              <>
                <Text style={s.big}>{item.h}</Text>
                <Text style={s.lead}>{item.p}</Text>
              </>
            ) : (
              <>
                <Text style={s.promise}>Free.</Text>
                <Text style={s.promise}>Unlimited.</Text>
                <Text style={s.promise}>Private.</Text>
                <Text style={[s.promise, { color: ink }]}>
                  Storage<Text style={{ color: "#1a56db" }}>.</Text>
                </Text>
                <View style={{ height: 36 }} />
                <Button title="Switch to Stash in 3 easy steps" onPress={() => start(false)} />
                <P small>Sign in with Google. No card.</P>
                <Button title="I already have an account" kind="text" onPress={() => start(true)} />
              </>
            )}
          </View>
        )}
      />
      {!last && (
        <View style={s.dots}>
          {[0, 1, 2].map((n) => (
            <View key={n} style={[s.dot, n === i && { backgroundColor: ink, width: 18 }]} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  skip: { position: "absolute", right: 24, top: 20, zIndex: 2 },
  skipText: { color: ink2, fontSize: 15 },
  slide: { flex: 1, justifyContent: "center", paddingHorizontal: 24, paddingBottom: 60 },
  big: { fontSize: 56, fontWeight: "700", color: ink, letterSpacing: -1, marginBottom: 16 },
  lead: { fontSize: 19, lineHeight: 27, color: ink2 },
  promise: { fontSize: 44, lineHeight: 50, fontWeight: "700", color: ink3, letterSpacing: -1 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingBottom: 28 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: line },
});

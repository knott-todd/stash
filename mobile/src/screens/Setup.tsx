// The "You're in" moment after the third step.
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button, font, ink, ink2, P, Screen, tight } from "../ui";
import { useSession } from "../session";
import { me } from "../api";
import { census } from "../backup";

type Nav = NativeStackNavigationProp<Record<string, undefined>>;

// After the third step: the feeling the website gives.
export function YouAreInScreen() {
  const nav = useNavigation<Nav>();
  const { cfg } = useSession();
  const [facts, setFacts] = useState<{ locked: boolean; files: number; photos: number } | null>(null);
  useEffect(() => {
    if (!cfg) return;
    Promise.all([me(cfg), census(cfg).catch(() => null)]).then(([w, c]) => setFacts({ locked: w.protection === "passcode", files: w.fileCount ?? 0, photos: c?.pending ?? 0 })).catch(() => setFacts({ locked: false, files: 0, photos: 0 }));
  }, [cfg]);
  return (
    <Screen centered bottom={<Button title="Open my drive" onPress={() => nav.reset({ index: 0, routes: [{ name: "Drive" }] })} />}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text style={s.in}>You’re in.</Text>
        <Text style={s.fact}>3 steps.</Text>
        <Text style={s.fact}>{facts?.locked ? "1 passcode, only yours." : "0 passwords."}</Text>
        <Text style={s.fact}>0 GB limit.</Text>
        {facts && (facts.files > 0 || facts.photos > 0) && (
          <P>
            {facts.files > 0 ? `${facts.files.toLocaleString()} files in your drive. ` : ""}
            {facts.photos > 0 ? `${facts.photos.toLocaleString()} photos will back up on Wi-Fi while charging.` : ""}
          </P>
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  in: { fontSize: 56, fontFamily: font.semibold, color: ink, marginBottom: 18, letterSpacing: -0.035 * 56 },
  fact: { fontSize: 32, fontFamily: font.semibold, color: ink2, marginBottom: 6, ...tight(32) },
});

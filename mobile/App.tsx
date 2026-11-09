// Stash for phones: the same product as the website, native. The journey is the
// website's: the landing page as a carousel, then three full-screen steps (sign in,
// move my files here, back up this phone), then "You're in", then the drive.
// (docs/PHONE-APP-BRIEF-2026-11-08.md, docs/phone/01-onboarding-and-setup.md)

import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, DefaultTheme, createNavigationContainerRef, type ParamListBase } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import { useFonts, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from "@expo-google-fonts/geist";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "./src/session";
import { nextRoute, type Dest } from "./src/flow";
import { paper } from "./src/ui";
import { CarouselScreen } from "./src/screens/Carousel";
import { ChoosePasscodeScreen, DecideScreen, EnterPasscodeScreen, RecoveryScreen } from "./src/screens/Protection";
import { StepsScreen } from "./src/screens/Steps";
import { YouAreInScreen } from "./src/screens/Setup";
import { DriveScreen } from "./src/screens/Drive";
import { MovePickerScreen } from "./src/screens/MovePicker";
import { useShareTarget } from "./src/share";
import "./src/backup"; // registers the background task

GoogleSignin.configure({ webClientId: String(Constants.expoConfig?.extra?.googleWebClientId ?? "") });

const Stack = createNativeStackNavigator();
const navRef = createNavigationContainerRef<ParamListBase>();
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: paper, card: paper, primary: "#111111" } };

function Root() {
  const { cfg, existing } = useSession();
  const [fontsReady] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold });
  const [initial, setInitial] = useState<Dest | null>(null);
  const [navReady, setNavReady] = useState(false);
  useShareTarget(navRef, navReady, cfg); // "Save to Stash" from other apps
  useEffect(() => {
    if (!cfg || initial) return;
    nextRoute(cfg, null, existing)
      .then(setInitial)
      .catch(() => setInitial({ name: "Carousel" }));
  }, [cfg, existing, initial]);
  if (!initial || !fontsReady)
    return (
      <View style={{ flex: 1, backgroundColor: paper, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  return (
    <NavigationContainer ref={navRef} theme={theme} onReady={() => setNavReady(true)}>
      <Stack.Navigator initialRouteName={initial.name} screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="Carousel" component={CarouselScreen} />
        <Stack.Screen name="Steps" component={StepsScreen} initialParams={initial.name === "Steps" ? initial.params : { step: 1 }} options={{ gestureEnabled: false }} />
        <Stack.Screen name="Decide" component={DecideScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="ChoosePasscode" component={ChoosePasscodeScreen} />
        <Stack.Screen name="Recovery" component={RecoveryScreen} />
        <Stack.Screen name="EnterPasscode" component={EnterPasscodeScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="YouAreIn" component={YouAreInScreen} options={{ gestureEnabled: false, animation: "fade" }} />
        <Stack.Screen name="Drive" component={DriveScreen} options={{ animation: "fade" }} />
        <Stack.Screen name="DriveMove" component={MovePickerScreen} options={{ animation: "slide_from_bottom" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Root />
    </SessionProvider>
  );
}

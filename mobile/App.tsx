// Stash for phones: the same product as the website, native. The journey is the
// website's: the landing page as a carousel, then three full-screen steps (sign in,
// move my files here, back up this phone), then "You're in", then the drive.
// (docs/PHONE-APP-BRIEF-2026-11-08.md, docs/phone/01-onboarding-and-setup.md)

import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { SessionProvider, useSession } from "./src/session";
import { nextRoute, type Route } from "./src/flow";
import { paper } from "./src/ui";
import { CarouselScreen } from "./src/screens/Carousel";
import { SignInScreen } from "./src/screens/SignIn";
import { ChoosePasscodeScreen, DecideScreen, EnterPasscodeScreen, RecoveryScreen } from "./src/screens/Protection";
import { BackupPhoneScreen, MoveFilesScreen, YouAreInScreen } from "./src/screens/Setup";
import { DriveScreen } from "./src/screens/Drive";
import "./src/backup"; // registers the background task

GoogleSignin.configure({ webClientId: String(Constants.expoConfig?.extra?.googleWebClientId ?? "") });

const Stack = createNativeStackNavigator();
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: paper, card: paper, primary: "#111111" } };

function Root() {
  const { cfg, existing } = useSession();
  const [initial, setInitial] = useState<Route | null>(null);
  useEffect(() => {
    if (!cfg || initial) return;
    nextRoute(cfg, null, existing)
      .then(setInitial)
      .catch(() => setInitial("Carousel"));
  }, [cfg, existing, initial]);
  if (!initial)
    return (
      <View style={{ flex: 1, backgroundColor: paper, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="Carousel" component={CarouselScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="Decide" component={DecideScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="ChoosePasscode" component={ChoosePasscodeScreen} />
        <Stack.Screen name="Recovery" component={RecoveryScreen} />
        <Stack.Screen name="EnterPasscode" component={EnterPasscodeScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="MoveFiles" component={MoveFilesScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="BackupPhone" component={BackupPhoneScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="YouAreIn" component={YouAreInScreen} options={{ gestureEnabled: false, animation: "fade" }} />
        <Stack.Screen name="Drive" component={DriveScreen} options={{ animation: "fade" }} />
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

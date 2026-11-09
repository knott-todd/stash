// Step 1: sign in with Google, through the phone's own account picker.
import React, { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Device from "expo-device";
import { GoogleSignin, isErrorWithCode, statusCodes } from "@react-native-google-signin/google-signin";
import { Brand, Button, ErrorLine, H1, P, Screen, StepTitle } from "../ui";
import { useSession } from "../session";
import { me, signInWithGoogle } from "../api";
import { nextRoute } from "../flow";

export function SignInScreen() {
  const nav = useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();
  const { cfg, update, existing } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState<string | null>(null);

  async function signIn() {
    if (!cfg || busy) return;
    setBusy(true);
    setError(null);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      if (res.type !== "success" || !res.data.idToken) return;
      const who = await signInWithGoogle(cfg.server, res.data.idToken, `${Device.deviceName ?? "Phone"}`);
      const next = await update({ token: who.token, deviceId: who.deviceId, email: who.email, pendingLink: undefined });
      const w = await me(next);
      if (existing && !w.protection) {
        // They said they had an account, but this one is new: say so, then the decision.
        setNewAccount(who.email ?? "that account");
        return;
      }
      nav.reset({ index: 0, routes: [{ name: await nextRoute(next, w, existing) }] });
    } catch (e) {
      if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return;
      setError(isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE ? "This phone needs Google Play services to sign in." : String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  if (newAccount)
    return (
      <Screen top={<Brand />} bottom={<Button title="Let's make one" onPress={() => nav.reset({ index: 0, routes: [{ name: "Decide" }] })} />}>
        <H1>No Stash account yet</H1>
        <P>There’s no Stash account for {newAccount} yet. Let’s make one.</P>
      </Screen>
    );

  return (
    <Screen
      top={<Brand />}
      bottom={
        <>
          <ErrorLine text={error} />
          <Button title="Continue with Google" onPress={signIn} busy={busy} />
        </>
      }
    >
      <StepTitle current={1} alone={existing} />
      <P>No password to make. Your Google account is enough.</P>
    </Screen>
  );
}

// "Save to Stash" from other apps' share sheets (modules/stash-share). A share that opened the
// app, or one that arrives while it is open, lands in My drive: in the folder on screen if My
// drive is in front, otherwise at the root. Each file goes through the same upload queue as
// the + sheet, with its ring and the web's messages; shared text becomes a .txt file. With no
// account signed in, the Steps screen says to sign in first.

import { useEffect, useRef } from "react";
import { CommonActions, StackActions, type NavigationContainerRefWithCurrent, type ParamListBase } from "@react-navigation/native";
import * as FileSystem from "expo-file-system/legacy";
import { getShared, onShared, type Shared } from "../modules/stash-share";
import type { Config } from "./api";
import * as drive from "./drive/store";

export const SIGN_IN_FIRST = "Sign in first, then share again.";

type Nav = NavigationContainerRefWithCurrent<ParamListBase>;

// A name from the text's first words: "Meet at the station at 6" -> "Meet at the station at.txt".
function textName(text: string) {
  const words = text.replace(/https?:\/\/(www\.)?/g, "").replace(/[\\/:*?"<>|\r\n\t]+/g, " ").trim().split(/\s+/).slice(0, 5).join(" ");
  return (words.slice(0, 48).trim() || "Shared text") + ".txt";
}

async function textFile(text: string) {
  const dir = (FileSystem.cacheDirectory ?? "") + `stash-shared/${Date.now()}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const name = textName(text);
  const uri = dir + name;
  await FileSystem.writeAsStringAsync(uri, text);
  const info = await FileSystem.getInfoAsync(uri);
  return { uri, name, mime: "text/plain", size: info.exists ? info.size : 0 };
}

async function handle(s: Shared, cfg: Config | null, nav: Nav) {
  if (!cfg?.token) {
    nav.dispatch(CommonActions.navigate("Steps", { step: 1, notice: SIGN_IN_FIRST }));
    return;
  }
  // Where it lands: the folder on screen, or My drive's root.
  const here = nav.getCurrentRoute();
  let folder = "";
  if (here?.name === "Drive") folder = (here.params as { folder?: string } | undefined)?.folder ?? "";
  else {
    const st = nav.getRootState();
    const at = st ? st.routes.map((r) => r.name).lastIndexOf("Drive") : -1;
    if (st && at >= 0) {
      folder = (st.routes[at].params as { folder?: string } | undefined)?.folder ?? "";
      nav.dispatch(StackActions.pop(st.routes.length - 1 - at));
    } else nav.dispatch(StackActions.push("Drive"));
  }
  drive.startDrive(cfg);
  const items = s.files.map((f) => ({ uri: f.uri, name: f.name, mime: f.mime, size: f.size }));
  // Text that comes with files is their caption; on its own it is the thing shared.
  if (!items.length && s.text) {
    try {
      items.push(await textFile(s.text));
    } catch {
      drive.toast("Couldn't save that text.");
    }
  }
  if (items.length) drive.enqueueUploads(items, folder);
}

// Reads the share that opened the app once navigation and the session are ready, then listens.
export function useShareTarget(nav: Nav, ready: boolean, cfg: Config | null) {
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  useEffect(() => {
    if (!ready || !cfg) return;
    const first = getShared();
    if (first) handle(first, cfgRef.current, nav);
    return onShared((s) => handle(s, cfgRef.current, nav));
    // Only once: later sessions are read through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, !!cfg]);
}

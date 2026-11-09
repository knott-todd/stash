import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";

// "Save to Stash" from other apps (see android/.../StashShareModule.kt). Null where the
// module is not built in, so the app simply never receives a share.
export type SharedFile = { uri: string; name: string; mime: string; size: number };
export type Shared = { uris: string[]; files: SharedFile[]; text?: string | null };

type StashShareNative = {
  getShared(): Shared | null;
  addListener(event: "onShared", listener: (s: Shared) => void): EventSubscription;
};

const Native = requireOptionalNativeModule<StashShareNative>("StashShare");

// The share that opened the app, read once (the module clears it).
export const getShared = (): Shared | null => Native?.getShared() ?? null;

// Shares that arrive while the app is open. Returns the unsubscribe.
export function onShared(listener: (s: Shared) => void): () => void {
  const sub = Native?.addListener("onShared", listener);
  return () => sub?.remove();
}

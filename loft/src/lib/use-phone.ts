"use client";

import { useSyncExternalStore } from "react";

// A touch-first device: the one holding the camera roll. Used to send photo
// backup straight to /m instead of showing a QR code to scan with itself.
const QUERY = "(pointer: coarse)";

function subscribe(cb: () => void) {
  const mq = matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function usePhone() {
  return useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches, () => false);
}

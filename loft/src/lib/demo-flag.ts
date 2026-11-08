"use client";

// Demo mode for the stage: switched on by ?demo=1 once, then remembered for this
// browser tab so it survives every click. Closing the tab ends it. Never on by default.
export function demoMode(params: URLSearchParams): boolean {
  try {
    if (params.get("demo") === "1") sessionStorage.setItem("stash_demo", "1");
    if (params.get("demo") === "0") sessionStorage.removeItem("stash_demo");
    return sessionStorage.getItem("stash_demo") === "1";
  } catch {
    return params.get("demo") === "1";
  }
}

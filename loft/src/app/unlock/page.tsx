import { Suspense } from "react";
import { Unlock } from "@/components/Unlock";

export const metadata = { title: "Stash — Unlock" };

// A device that can list files but has no key: scan the code shown on a device
// that does, or type the recovery code.
export default function UnlockPage() {
  return (
    <Suspense>
      <Unlock />
    </Suspense>
  );
}

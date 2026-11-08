import { Suspense } from "react";
import { Approve } from "@/components/Approve";

export const metadata = { title: "Stash — Approve a device" };

// Opened on a phone that has the key, by scanning the code a laptop is showing.
export default function ApprovePage() {
  return (
    <Suspense>
      <Approve />
    </Suspense>
  );
}

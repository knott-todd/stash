import { Suspense } from "react";
import { LinkDevice } from "@/components/LinkDevice";

export const metadata = { title: "Stash — Link a device" };

export default function LinkDevicePage() {
  return (
    <Suspense>
      <LinkDevice />
    </Suspense>
  );
}

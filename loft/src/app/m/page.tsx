import { Suspense } from "react";
import { PhoneBackup } from "@/components/PhoneBackup";

export default function PhonePage() {
  return (
    <Suspense>
      <PhoneBackup />
    </Suspense>
  );
}

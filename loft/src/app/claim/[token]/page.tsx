import { Suspense } from "react";
import { Claim } from "@/components/Claim";

// Opened from an email link or QR on another device: adopts the drive and its key.
export default function ClaimPage() {
  return (
    <Suspense>
      <Claim />
    </Suspense>
  );
}

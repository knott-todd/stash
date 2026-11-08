import { Suspense } from "react";
import { Drive } from "@/components/Drive";

export default function DrivePage() {
  return (
    <Suspense>
      <Drive />
    </Suspense>
  );
}

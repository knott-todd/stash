import { Suspense } from "react";
import { SignIn } from "@/components/SignIn";

export const metadata = { title: "Stash — Sign in" };

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}

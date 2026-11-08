import { redirect } from "next/navigation";

// "Get started" is a sign-in: your files follow your Google account.
export default function StartPage() {
  redirect("/signin");
}

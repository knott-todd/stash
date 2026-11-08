import { redirect } from "next/navigation";

// There is no setup. "Get started" lands straight in the drive; the device is the identity.
export default function StartPage() {
  redirect("/drive");
}

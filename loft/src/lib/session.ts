import { cookies } from "next/headers";
import { newId } from "./store";

const COOKIE = "loft_uid";

// Anonymous device identity. Linking to Telegram attaches a name/chat to it.
export async function getUid(): Promise<string> {
  const jar = await cookies();
  let uid = jar.get(COOKIE)?.value;
  if (!uid) {
    uid = newId();
    jar.set(COOKIE, uid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return uid;
}

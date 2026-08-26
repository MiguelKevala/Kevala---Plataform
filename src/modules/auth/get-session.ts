import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "./constants";
import { getSessionByToken } from "./session";

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  return getSessionByToken(token);
}

import { cookies } from "next/headers";

export const AUTH_COOKIE_NAME = "ffg_manager_session";
const AUTH_COOKIE_VALUE = "manager-authenticated";

export async function isAuthenticatedSession() {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value === AUTH_COOKIE_VALUE;
}

export function getSessionCookieValue() {
  return AUTH_COOKIE_VALUE;
}

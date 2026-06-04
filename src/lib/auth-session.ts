import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, parseSessionEmail, serializeSession } from "./auth-session-codec";

export { AUTH_COOKIE_NAME, parseSessionEmail };

export async function getAuthenticatedEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  return parseSessionEmail(cookieStore.get(AUTH_COOKIE_NAME)?.value);
}

export async function isAuthenticatedSession() {
  return (await getAuthenticatedEmail()) !== null;
}

export function getSessionCookieValue(email: string) {
  return serializeSession(email);
}

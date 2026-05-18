import { cookies } from "next/headers";

export const AUTH_COOKIE_NAME = "ffg_manager_session";

function serializeSession(email: string) {
  return `email:${encodeURIComponent(email.trim().toLowerCase())}`;
}

function parseSession(value: string | undefined): string | null {
  if (!value || !value.startsWith("email:")) {
    return null;
  }

  const encoded = value.slice("email:".length);
  if (!encoded) {
    return null;
  }

  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export async function getAuthenticatedEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  return parseSession(cookieStore.get(AUTH_COOKIE_NAME)?.value);
}

export async function isAuthenticatedSession() {
  return (await getAuthenticatedEmail()) !== null;
}

export function getSessionCookieValue(email: string) {
  return serializeSession(email);
}

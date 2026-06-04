export const AUTH_COOKIE_NAME = "ffg_manager_session";

export function serializeSession(email: string) {
  return `email:${encodeURIComponent(email.trim().toLowerCase())}`;
}

export function parseSessionEmail(value: string | undefined): string | null {
  if (!value || !value.startsWith("email:")) {
    return null;
  }

  const encoded = value.slice("email:".length);
  if (!encoded) {
    return null;
  }

  try {
    const email = decodeURIComponent(encoded).trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return null;
    }

    return email;
  } catch {
    return null;
  }
}

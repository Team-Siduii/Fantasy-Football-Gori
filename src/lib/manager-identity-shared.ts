export function normalizeManagerIdentityEmail(email?: string | null) {
  if (typeof email !== "string") {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeManagerIdentityValue(value?: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

export function buildManagerIdentityScopeKey(mode: "eredivisie" | "wk", email?: string | null) {
  return `${mode}:${normalizeManagerIdentityEmail(email) ?? "anonymous"}`;
}

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getAuthenticatedEmail = vi.fn(async () => null as string | null);
const isAdminEmail = vi.fn(() => false);
const resolveGoriDatabaseDebugInfo = vi.fn(() => ({
  enabled: true,
  disabledByEnv: false,
  sourceEnv: "DATABASE_URL" as const,
  host: "ep-cool-db.eu-central-1.aws.neon.tech",
  database: "gori_prod",
  user: "quota_user",
  neonProjectId: "calm-river-123456",
}));

vi.mock("@/lib/auth-session", () => ({
  getAuthenticatedEmail,
}));

vi.mock("@/lib/auth-store", () => ({
  isAdminEmail,
}));

vi.mock("@/lib/persistent-json-store", () => ({
  resolveGoriDatabaseDebugInfo,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/database-debug", () => {
  it("returns 401 when no session is present", async () => {
    getAuthenticatedEmail.mockResolvedValueOnce(null);
    const { GET } = await import("../../src/app/api/admin/database-debug/route");

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Niet ingelogd" });
    expect(isAdminEmail).not.toHaveBeenCalled();
  });

  it("returns safe database identity for authenticated admins", async () => {
    getAuthenticatedEmail.mockResolvedValueOnce("admin@gori.local");
    isAdminEmail.mockReturnValueOnce(true);

    const { GET } = await import("../../src/app/api/admin/database-debug/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(isAdminEmail).toHaveBeenCalledWith("admin@gori.local");
    expect(resolveGoriDatabaseDebugInfo).toHaveBeenCalledTimes(1);
    expect(payload).toEqual({
      database: {
        enabled: true,
        disabledByEnv: false,
        sourceEnv: "DATABASE_URL",
        host: "ep-cool-db.eu-central-1.aws.neon.tech",
        database: "gori_prod",
        user: "quota_user",
        neonProjectId: "calm-river-123456",
      },
    });
  });
});

describe("legacy /api/admin/db-debug hardening", () => {
  it("keeps the legacy GET route admin-only and read-only", async () => {
    getAuthenticatedEmail.mockResolvedValueOnce("admin@gori.local");
    isAdminEmail.mockReturnValueOnce(true);

    const { GET } = await import("../../src/app/api/admin/db-debug/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      route: "db-debug",
      deprecated: true,
      canonicalRoute: "/api/admin/database-debug",
      database: {
        host: "ep-cool-db.eu-central-1.aws.neon.tech",
        database: "gori_prod",
        user: "quota_user",
      },
    });
  });

  it("rejects legacy POST writes", async () => {
    const { POST } = await import("../../src/app/api/admin/db-debug/route");
    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(405);
    expect(payload).toEqual({
      error: "Gebruik alleen GET op /api/admin/database-debug voor veilige DB-identiteitsdebug.",
    });
  });
});

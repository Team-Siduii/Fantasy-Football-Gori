import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ADMIN_EMAIL = ["admin", "gori.local"].join("@");
const GHOST_KEY = ["johan.swart", "gmail.com"].join("@");
const getAuthenticatedEmail = vi.fn(async () => ADMIN_EMAIL);
const isAdminEmail = vi.fn((email: string) => email === ADMIN_EMAIL);
const query = vi.fn();
const end = vi.fn(async () => undefined);
const Pool = vi.fn(function MockPool() {
  return { query, end };
});

vi.mock("@/lib/auth-session", () => ({ getAuthenticatedEmail }));
vi.mock("@/lib/auth-store", () => ({ isAdminEmail }));
vi.mock("pg", () => ({ Pool }));

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.GORI_DATABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
});

describe("POST /api/admin/remove-manager-state-key", () => {
  it("removes exactly the requested manager-state key from the shared payload", async () => {
    process.env.DATABASE_URL = "postgres://example";
    query
      .mockResolvedValueOnce({
        rows: [
          {
            payload: {
              managerStates: {
                "johan-swart": { lineupIds: ["253"] },
                [GHOST_KEY]: { lineupIds: ["253"] },
                "ice-eckmund": { lineupIds: ["10"] },
              },
              roundLocks: [],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const { POST } = await import("../../src/app/api/admin/remove-manager-state-key/route");
    const response = await POST(
      new Request("http://localhost/api/admin/remove-manager-state-key?mode=wk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerKey: GHOST_KEY }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getAuthenticatedEmail).toHaveBeenCalledTimes(1);
    expect(isAdminEmail).toHaveBeenCalledWith(ADMIN_EMAIL);
    expect(query).toHaveBeenNthCalledWith(
      1,
      "SELECT payload FROM gori_fantasy_state WHERE state_key = $1 LIMIT 1",
      ["gori_fantasy:manager-state:wk:shared"],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO gori_fantasy_state"),
      [
        "gori_fantasy:manager-state:wk:shared",
        "wk",
        JSON.stringify({
          managerStates: {
            "johan-swart": { lineupIds: ["253"] },
            "ice-eckmund": { lineupIds: ["10"] },
          },
          roundLocks: [],
        }),
      ],
    );
    expect(payload).toEqual({
      ok: true,
      scope: "wk",
      removedManagerKey: GHOST_KEY,
      managerCountBefore: 3,
      managerCountAfter: 2,
      remainingKeys: ["johan-swart", "ice-eckmund"],
    });
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when the requested key does not exist", async () => {
    process.env.DATABASE_URL = "postgres://example";
    query.mockResolvedValueOnce({
      rows: [
        {
          payload: {
            managerStates: {
              "johan-swart": { lineupIds: ["253"] },
            },
          },
        },
      ],
    });

    const { POST } = await import("../../src/app/api/admin/remove-manager-state-key/route");
    const response = await POST(
      new Request("http://localhost/api/admin/remove-manager-state-key?mode=wk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerKey: GHOST_KEY }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toMatchObject({
      error: "Manager key niet gevonden",
      scope: "wk",
      managerKey: GHOST_KEY,
      keys: ["johan-swart"],
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });
});

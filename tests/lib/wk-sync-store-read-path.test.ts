import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const poolQuery = vi.fn();

vi.mock("pg", () => ({
  Pool: class MockPool {
    query = poolQuery;
    end = vi.fn(async () => undefined);
  },
}));

async function loadStore() {
  return import("../../src/lib/wk-sync-store");
}

describe("wk sync store read path", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalPostgresUrl = process.env.POSTGRES_URL;
  const originalGoriDatabaseUrl = process.env.GORI_DATABASE_URL;
  const originalDisable = process.env.GORI_DISABLE_DATABASE;

  beforeEach(async () => {
    poolQuery.mockReset();
    vi.resetModules();
    const store = await loadStore();
    store.resetWkSyncStoreForTests();
  });

  afterEach(async () => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = originalPostgresUrl;
    if (originalGoriDatabaseUrl === undefined) delete process.env.GORI_DATABASE_URL;
    else process.env.GORI_DATABASE_URL = originalGoriDatabaseUrl;
    if (originalDisable === undefined) delete process.env.GORI_DISABLE_DATABASE;
    else process.env.GORI_DISABLE_DATABASE = originalDisable;

    const store = await loadStore();
    store.resetWkSyncStoreForTests();
  });

  it("reads latest sync round without attempting schema bootstrap DDL", async () => {
    process.env.GORI_DATABASE_URL = "postgres://gori:***@example.com/gori";
    poolQuery.mockResolvedValueOnce({ rows: [{ max_round: 7 }] });

    const store = await loadStore();
    const round = await store.getLatestSyncRound();

    expect(round).toBe(7);
    expect(poolQuery).toHaveBeenCalledTimes(1);
    expect(poolQuery.mock.calls[0]?.[0]).toContain("SELECT MAX(round)");
    expect(poolQuery.mock.calls[0]?.[0]).not.toContain("CREATE TABLE");
    expect(poolQuery.mock.calls[0]?.[0]).not.toContain("ALTER TABLE");
  });

  it("reads wk matches without attempting schema bootstrap DDL", async () => {
    process.env.GORI_DATABASE_URL = "postgres://gori:***@example.com/gori";
    poolQuery.mockResolvedValueOnce({
      rows: [{ match_id: 11, round: 3, home_team: "NL", away_team: "ES", home_team_code: "NLD", away_team_code: "ESP", home_score: 2, away_score: 1, status: "FT", minute: null, kickoff_at: null, synced_at: "2026-07-08T12:00:00Z" }],
    });

    const store = await loadStore();
    const matches = await store.getWkMatches(3);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.match_id).toBe(11);
    expect(poolQuery).toHaveBeenCalledTimes(1);
    expect(poolQuery.mock.calls[0]?.[0]).toContain("SELECT * FROM wk_matches");
    expect(poolQuery.mock.calls[0]?.[0]).not.toContain("CREATE TABLE");
    expect(poolQuery.mock.calls[0]?.[0]).not.toContain("ALTER TABLE");
  });
});

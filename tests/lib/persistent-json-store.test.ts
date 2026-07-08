import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const poolQuery = vi.fn();

vi.mock("pg", () => ({
  Pool: class MockPool {
    query = poolQuery;
    end = vi.fn(async () => undefined);
  },
}));

async function loadStore() {
  return import("../../src/lib/persistent-json-store");
}

describe("persistent JSON store", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalPostgresUrl = process.env.POSTGRES_URL;
  const originalGoriDatabaseUrl = process.env.GORI_DATABASE_URL;
  const originalDisable = process.env.GORI_DISABLE_DATABASE;

  beforeEach(async () => {
    poolQuery.mockReset();
    vi.resetModules();
    const store = await loadStore();
    store.resetPersistentJsonStoreForTests();
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
    store.resetPersistentJsonStoreForTests();
  });

  it("uses a Gori-specific database env var before shared URLs", async () => {
    const store = await loadStore();
    process.env.GORI_DATABASE_URL = "gori-db-url";
    process.env.DATABASE_URL = "shared-db-url";

    expect(store.resolveGoriDatabaseUrl()).toBe("gori-db-url");
  });

  it("keeps state keys separated by app namespace, store, scope and manager", async () => {
    const store = await loadStore();

    expect(store.buildPersistentStateKey({ store: "manager-state", scope: "wk", managerKey: "Johan@Example.com" })).toBe(
      "gori_fantasy:manager-state:wk:johan@example.com",
    );
    expect(store.buildPersistentStateKey({ store: "manager-state", scope: "eredivisie", managerKey: "Johan@Example.com" })).toBe(
      "gori_fantasy:manager-state:eredivisie:johan@example.com",
    );
  });

  it("reads persisted JSON without attempting schema bootstrap DDL on the read path", async () => {
    process.env.GORI_DATABASE_URL = "postgres://gori:***@example.com/gori";
    poolQuery.mockResolvedValueOnce({
      rows: [{ payload: { ok: true } }],
    });

    const store = await loadStore();
    const result = await store.readPersistentJson(
      { store: "player-points", scope: "wk" },
      { ok: false },
    );

    expect(result).toEqual({ ok: true });
    expect(poolQuery).toHaveBeenCalledTimes(1);
    expect(poolQuery.mock.calls[0]?.[0]).toContain("SELECT payload FROM gori_fantasy_state");
    expect(poolQuery.mock.calls[0]?.[0]).not.toContain("CREATE TABLE");
  });

  it("writes persisted JSON without attempting schema bootstrap DDL when the table already exists", async () => {
    process.env.GORI_DATABASE_URL = "postgres://gori:***@example.com/gori";
    poolQuery.mockResolvedValueOnce({ rows: [] });

    const store = await loadStore();
    const payload = { ok: true };
    const result = await store.writePersistentJson({ store: "auth-state", scope: "global" }, payload);

    expect(result).toEqual(payload);
    expect(poolQuery).toHaveBeenCalledTimes(1);
    expect(poolQuery.mock.calls[0]?.[0]).toContain("INSERT INTO gori_fantasy_state");
    expect(poolQuery.mock.calls[0]?.[0]).not.toContain("CREATE TABLE");
  });

  it("bootstraps and retries writes only when the backing table is missing", async () => {
    process.env.GORI_DATABASE_URL = "postgres://gori:***@example.com/gori";
    const missingTableError = Object.assign(new Error("relation \"gori_fantasy_state\" does not exist"), { code: "42P01" });
    poolQuery.mockRejectedValueOnce(missingTableError);
    poolQuery.mockResolvedValueOnce({ rows: [] });
    poolQuery.mockResolvedValueOnce({ rows: [] });
    poolQuery.mockResolvedValueOnce({ rows: [] });

    const store = await loadStore();
    const payload = { ok: true };
    const result = await store.writePersistentJson({ store: "auth-state", scope: "global" }, payload);

    expect(result).toEqual(payload);
    expect(poolQuery).toHaveBeenCalledTimes(4);
    expect(poolQuery.mock.calls[0]?.[0]).toContain("INSERT INTO gori_fantasy_state");
    expect(poolQuery.mock.calls[1]?.[0]).toContain("CREATE TABLE IF NOT EXISTS gori_fantasy_state");
    expect(poolQuery.mock.calls[2]?.[0]).toContain("CREATE INDEX IF NOT EXISTS gori_fantasy_state_store_scope_idx");
    expect(poolQuery.mock.calls[3]?.[0]).toContain("INSERT INTO gori_fantasy_state");
  });
});

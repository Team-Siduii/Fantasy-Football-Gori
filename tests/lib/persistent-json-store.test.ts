import { afterEach, describe, expect, it } from "vitest";

async function loadStore() {
  return import("../../src/lib/persistent-json-store");
}

describe("persistent JSON store", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalPostgresUrl = process.env.POSTGRES_URL;
  const originalGoriDatabaseUrl = process.env.GORI_DATABASE_URL;
  const originalDisable = process.env.GORI_DISABLE_DATABASE;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = originalPostgresUrl;
    if (originalGoriDatabaseUrl === undefined) delete process.env.GORI_DATABASE_URL;
    else process.env.GORI_DATABASE_URL = originalGoriDatabaseUrl;
    if (originalDisable === undefined) delete process.env.GORI_DISABLE_DATABASE;
    else process.env.GORI_DISABLE_DATABASE = originalDisable;
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
});

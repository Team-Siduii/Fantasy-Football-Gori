import { afterEach, describe, expect, it } from "vitest";

const originalEnv = { ...process.env };

afterEach(async () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const mod = await import("../../src/lib/persistent-json-store");
  mod.resetPersistentJsonStoreForTests();
});

describe("resolveGoriDatabaseDebugInfo", () => {
  it("extracts host, database and user from the active connection string", async () => {
    process.env.GORI_DISABLE_DATABASE = "0";
    process.env.DATABASE_URL = "postgres://quota_user:super-secret@ep-cool-db.eu-central-1.aws.neon.tech/gori_prod?sslmode=require";
    process.env.NEON_PROJECT_ID = "calm-river-123456";
    delete process.env.GORI_DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_HOST;
    delete process.env.POSTGRES_DATABASE;
    delete process.env.PGDATABASE;
    delete process.env.POSTGRES_USER;

    const { resolveGoriDatabaseDebugInfo } = await import("../../src/lib/persistent-json-store");
    const info = resolveGoriDatabaseDebugInfo();

    expect(info).toMatchObject({
      enabled: true,
      disabledByEnv: false,
      sourceEnv: "DATABASE_URL",
      host: "ep-cool-db.eu-central-1.aws.neon.tech",
      database: "gori_prod",
      user: "quota_user",
      neonProjectId: "calm-river-123456",
    });
  });

  it("falls back to discrete env vars and reports disabled state", async () => {
    process.env.GORI_DISABLE_DATABASE = "true";
    process.env.POSTGRES_HOST = "fallback-host.neon.tech";
    process.env.POSTGRES_DATABASE = "fallback_db";
    process.env.POSTGRES_USER = "fallback_user";
    process.env.NEON_PROJECT_ID = "fallback-project";
    delete process.env.GORI_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;

    const { resolveGoriDatabaseDebugInfo } = await import("../../src/lib/persistent-json-store");
    const info = resolveGoriDatabaseDebugInfo();

    expect(info).toMatchObject({
      enabled: false,
      disabledByEnv: true,
      sourceEnv: null,
      host: "fallback-host.neon.tech",
      database: "fallback_db",
      user: "fallback_user",
      neonProjectId: "fallback-project",
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const TEST_PATH = "/tmp/ffg-auth-test.json";

async function loadStore() {
  process.env.AUTH_STATE_PATH = TEST_PATH;
  const mod = await import("../../src/lib/auth-store");
  mod.resetAuthStateForTests();
  return mod;
}

afterEach(() => {
  delete process.env.AUTH_STATE_PATH;
  delete process.env.GORI_DATABASE_URL;
  vi.doUnmock("../../src/lib/persistent-json-store");
  vi.resetModules();
});

describe("auth-store security", () => {
  it("authenticates manager invite codes and admin password", async () => {
    const store = await loadStore();

    expect(store.authenticateManager("Johan201@hotmail.com", "WK-JOHAN-2026")).toBe(true);
    expect(store.authenticateManager("Thomasbart91@gmail.com", "WK-THOMAS-2026")).toBe(true);
    expect(store.authenticateManager("Jackvandereep@hotmail.com", "WK-JACK-2026")).toBe(true);
    expect(store.authenticateManager("emielzomerdijk@gmail.com", "WK-EMIEL-2026")).toBe(true);
    expect(store.authenticateManager("s.j.m.duindam@gmail.com", "WK-SIM-ADMIN-2026")).toBe(true);
    expect(store.authenticateManager("admin@gori.local", "admin1234")).toBe(true);
    expect(store.authenticateManager("Johan201@hotmail.com", "wrong")).toBe(false);
  }, 15000);

  it("marks first login as setup required then clears after setup", async () => {
    const store = await loadStore();

    expect(store.authenticateManagerWithStatus("Johan201@hotmail.com", "WK-JOHAN-2026")).toEqual({
      ok: true,
      requiresSetup: true,
    });

    expect(store.completeInitialSetup("Johan201@hotmail.com", "WK-JOHAN-2026", "NieuwSterk123", "Oranje Lions")).toBe(true);
    expect(store.authenticateManagerWithStatus("Johan201@hotmail.com", "NieuwSterk123")).toEqual({
      ok: true,
      requiresSetup: false,
    });
  });

  it("changes password for logged manager credential", async () => {
    const store = await loadStore();

    store.completeInitialSetup("Thomasbart91@gmail.com", "WK-THOMAS-2026", "ThomasPass123", "Team Thomas");
    expect(store.changePassword("Thomasbart91@gmail.com", "ThomasPass123", "ThomasPass456")).toBe(true);
    expect(store.authenticateManager("Thomasbart91@gmail.com", "ThomasPass456")).toBe(true);
  });

  it("keeps an edited team name after a fresh auth-state reload", async () => {
    const store = await loadStore();

    expect(store.updateProfileByEmail("Johan201@hotmail.com", { name: "Johan Swart", teamName: "Oranje Kampioenen" })).toMatchObject({
      teamName: "Oranje Kampioenen",
    });

    store.reloadAuthStateForTests();

    expect(store.authenticateManager("Johan201@hotmail.com", "WK-JOHAN-2026")).toBe(true);
    expect(store.getProfileByEmail("Johan201@hotmail.com")?.teamName).toBe("Oranje Kampioenen");
  });

  it("uses /tmp auth-state storage by default on Vercel serverless", async () => {
    const previousVercel = process.env.VERCEL;
    delete process.env.AUTH_STATE_PATH;
    process.env.VERCEL = "1";
    const store = await import("../../src/lib/auth-store");

    expect(store.getAuthStateStoragePath()).toBe("/tmp/gori-auth-state.json");

    if (previousVercel === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = previousVercel;
    }
  });

  it("keeps login auth available when the database read path throws", async () => {
    vi.resetModules();
    process.env.AUTH_STATE_PATH = TEST_PATH;
    process.env.GORI_DATABASE_URL = "postgres://gori:test@example.com/gori";
    vi.doMock("../../src/lib/persistent-json-store", () => ({
      isGoriDatabaseEnabled: () => true,
      readPersistentJson: vi.fn(async () => {
        throw new Error("database read failed");
      }),
      writePersistentJson: vi.fn(async (_input, payload) => payload),
    }));

    const store = await import("../../src/lib/auth-store");
    store.resetAuthStateForTests();

    await expect(store.ensureAuthStateFromDb()).resolves.toBeUndefined();
    expect(store.authenticateManager("admin@gori.local", "admin1234")).toBe(true);
  });

  it("resets password via token and invalidates used token", async () => {
    const store = await loadStore();

    const token = store.createPasswordResetToken("admin@gori.local", 1800);
    expect(token).toBeTruthy();

    expect(store.consumePasswordResetToken(token as string, "newAdminPass1")).toBe(true);
    expect(store.authenticateManager("admin@gori.local", "newAdminPass1")).toBe(true);
    expect(store.consumePasswordResetToken(token as string, "newAdminPass2")).toBe(false);
  });
});

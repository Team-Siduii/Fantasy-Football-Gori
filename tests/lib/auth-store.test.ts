import { afterEach, describe, expect, it } from "vitest";

const TEST_PATH = "/tmp/ffg-auth-test.json";

async function loadStore() {
  process.env.AUTH_STATE_PATH = TEST_PATH;
  const mod = await import("../../src/lib/auth-store");
  mod.resetAuthStateForTests();
  return mod;
}

afterEach(() => {
  delete process.env.AUTH_STATE_PATH;
});

describe("auth-store security", () => {
  it("authenticates default manager/admin and rejects invalid password", async () => {
    const store = await loadStore();

    expect(store.authenticateManager("manager@gori.local", "gori1234")).toBe(true);
    expect(store.authenticateManager("admin@gori.local", "admin1234")).toBe(true);
    expect(store.authenticateManager("manager@gori.local", "wrong")).toBe(false);
  });

  it("resets password via token and invalidates used token", async () => {
    const store = await loadStore();

    const token = store.createPasswordResetToken("manager@gori.local", 1800);
    expect(token).toBeTruthy();

    expect(store.consumePasswordResetToken(token as string, "newStrongPass1")).toBe(true);
    expect(store.authenticateManager("manager@gori.local", "newStrongPass1")).toBe(true);
    expect(store.consumePasswordResetToken(token as string, "newStrongPass2")).toBe(false);
  });

  it("creates and consumes reset tokens for admin account", async () => {
    const store = await loadStore();

    const token = store.createPasswordResetToken("admin@gori.local", 1800);
    expect(token).toBeTruthy();

    expect(store.consumePasswordResetToken(token as string, "newAdminPass1")).toBe(true);
    expect(store.authenticateManager("admin@gori.local", "newAdminPass1")).toBe(true);
  });

  it("rejects expired reset token", async () => {
    const store = await loadStore();

    const token = store.createPasswordResetToken("manager@gori.local", -1);
    expect(token).toBeTruthy();
    expect(store.consumePasswordResetToken(token as string, "newStrongPass1")).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("team-roster-state", () => {
  afterEach(() => {
    delete process.env.GORI_DATABASE_URL;
    vi.doUnmock("../../src/lib/persistent-json-store");
    vi.resetModules();
  });

  beforeEach(() => {
    process.env.TEAM_ROSTER_STATE_PATH = "/tmp/ffg-team-roster-visibility.test.json";
  });

  it("adds and removes players per team without duplicates", async () => {
    const mod = await import("../../src/lib/team-roster-state");
    mod.resetTeamRosterStateForTests();

    mod.addPlayerToTeamRoster("A", "p-1");
    mod.addPlayerToTeamRoster("A", "p-1");
    mod.addPlayerToTeamRoster("A", "p-2");

    expect(mod.readTeamRosterState().byTeamId.A).toEqual(["p-1", "p-2"]);

    mod.removePlayerFromTeamRoster("A", "p-1");
    expect(mod.readTeamRosterState().byTeamId.A).toEqual(["p-2"]);
  });

  it("falls back gracefully when persistent team-roster reads fail", async () => {
    process.env.GORI_DATABASE_URL = "postgres://gori:***@example.com/gori";

    vi.doMock("../../src/lib/persistent-json-store", () => ({
      isGoriDatabaseEnabled: () => true,
      readPersistentJson: vi.fn(async () => {
        throw new Error("team-roster read failed");
      }),
      writePersistentJson: vi.fn(async (_input, payload) => payload),
    }));

    const mod = await import("../../src/lib/team-roster-state");
    mod.resetTeamRosterStateForTests();
    mod.addPlayerToTeamRoster("A", "p-1");

    await expect(mod.readTeamRosterStatePersistent()).resolves.toEqual({
      byTeamId: { A: ["p-1"] },
    });
  });
});

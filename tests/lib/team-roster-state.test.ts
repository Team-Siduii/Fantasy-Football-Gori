import { beforeEach, describe, expect, it } from "vitest";

describe("team-roster-state", () => {
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
});

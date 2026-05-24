import { beforeEach, describe, expect, it } from "vitest";

describe("draft-state persistence", () => {
  beforeEach(() => {
    process.env.DRAFT_STATE_PATH = "/tmp/ffg-draft-state.test.json";
    process.env.TEAM_ROSTER_STATE_PATH = "/tmp/ffg-team-roster-state.test.json";
  });

  it("starts a draft and computes current turn from A,A,reverse(A)", async () => {
    const mod = await import("../../src/lib/draft-state");
    const rosterMod = await import("../../src/lib/team-roster-state");
    mod.resetDraftStateForTests();
    rosterMod.resetTeamRosterStateForTests();

    const started = mod.startDraft({
      leagueId: "league-1",
      teamOrder: ["A", "B", "C"],
      totalRounds: 2,
      startedBy: "admin-1",
      startedAt: "2026-05-24T08:00:00.000Z",
    });

    expect(started.status).toBe("ACTIVE");
    expect(started.totalPicks).toBe(6);
    expect(started.currentTurnTeamId).toBe("A");

    const afterOnePick = mod.registerPick({
      teamId: "A",
      playerId: "p-1",
      at: "2026-05-24T08:01:00.000Z",
    });

    expect(afterOnePick.currentTurnTeamId).toBe("B");
  });

  it("blocks same player from being picked twice", async () => {
    const mod = await import("../../src/lib/draft-state");
    const rosterMod = await import("../../src/lib/team-roster-state");
    mod.resetDraftStateForTests();
    rosterMod.resetTeamRosterStateForTests();

    mod.startDraft({
      leagueId: "league-1",
      teamOrder: ["A", "B"],
      totalRounds: 1,
      startedBy: "admin-1",
      startedAt: "2026-05-24T08:00:00.000Z",
    });

    mod.registerPick({ teamId: "A", playerId: "p-1" });
    expect(() => mod.registerPick({ teamId: "B", playerId: "p-1" })).toThrow(/already picked/i);
  });

  it("supports returning a player to pool and resets pick slot", async () => {
    const mod = await import("../../src/lib/draft-state");
    const rosterMod = await import("../../src/lib/team-roster-state");
    mod.resetDraftStateForTests();
    rosterMod.resetTeamRosterStateForTests();

    mod.startDraft({
      leagueId: "league-1",
      teamOrder: ["A", "B"],
      totalRounds: 1,
      startedBy: "admin-1",
      startedAt: "2026-05-24T08:00:00.000Z",
    });

    mod.registerPick({ teamId: "A", playerId: "p-1" });
    const afterReturn = mod.returnPickedPlayerToPool({
      teamId: "A",
      playerId: "p-1",
      reason: "test reset",
      at: "2026-05-24T08:05:00.000Z",
    });

    expect(afterReturn.picks).toHaveLength(0);
    expect(afterReturn.currentTurnTeamId).toBe("A");
  });

  it("syncs pick and return into team roster state", async () => {
    const mod = await import("../../src/lib/draft-state");
    const rosterMod = await import("../../src/lib/team-roster-state");
    mod.resetDraftStateForTests();
    rosterMod.resetTeamRosterStateForTests();

    mod.startDraft({
      leagueId: "league-1",
      teamOrder: ["A", "B"],
      totalRounds: 1,
      startedBy: "admin-1",
    });

    mod.registerPick({ teamId: "A", playerId: "p-1" });
    expect(rosterMod.readTeamRosterState().byTeamId.A).toEqual(["p-1"]);

    mod.returnPickedPlayerToPool({ teamId: "A", playerId: "p-1", reason: "undo" });
    expect(rosterMod.readTeamRosterState().byTeamId.A).toEqual([]);
  });
});

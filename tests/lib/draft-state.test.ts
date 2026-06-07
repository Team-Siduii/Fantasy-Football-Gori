import { beforeEach, describe, expect, it } from "vitest";

describe("draft-state persistence", () => {
  beforeEach(() => {
    process.env.DRAFT_STATE_PATH = "/tmp/ffg-draft-state.test.json";
    process.env.DRAFT_STATE_WK_PATH = "/tmp/ffg-draft-state-wk.test.json";
    process.env.TEAM_ROSTER_STATE_PATH = "/tmp/ffg-team-roster-state.test.json";
    process.env.TEAM_ROSTER_STATE_WK_PATH = "/tmp/ffg-team-roster-state-wk.test.json";
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

  it("keeps Eredivisie and WK draft state + rosters isolated", async () => {
    const mod = await import("../../src/lib/draft-state");
    const rosterMod = await import("../../src/lib/team-roster-state");
    mod.resetDraftStateForTests("eredivisie");
    mod.resetDraftStateForTests("wk");
    rosterMod.resetTeamRosterStateForTests("eredivisie");
    rosterMod.resetTeamRosterStateForTests("wk");

    mod.startDraft({
      leagueId: "eredivisie-2025-2026",
      teamOrder: ["A", "B"],
      totalRounds: 1,
      startedBy: "admin-1",
      scope: "eredivisie",
    });
    mod.registerPick({ teamId: "A", playerId: "eredivisie-player-1", scope: "eredivisie" });

    mod.startDraft({
      leagueId: "wk-2026",
      teamOrder: ["A", "B"],
      totalRounds: 1,
      startedBy: "admin-1",
      scope: "wk",
    });
    mod.registerPick({ teamId: "A", playerId: "wk-player-1", scope: "wk" });

    expect(mod.readDraftState("eredivisie").leagueId).toBe("eredivisie-2025-2026");
    expect(mod.readDraftState("eredivisie").picks[0]?.playerId).toBe("eredivisie-player-1");
    expect(mod.readDraftState("wk").leagueId).toBe("wk-2026");
    expect(mod.readDraftState("wk").picks[0]?.playerId).toBe("wk-player-1");
    expect(rosterMod.readTeamRosterState("eredivisie").byTeamId.A).toEqual(["eredivisie-player-1"]);
    expect(rosterMod.readTeamRosterState("wk").byTeamId.A).toEqual(["wk-player-1"]);
  });

  it("blocks a draft pick when the team value would exceed the transfer budget", async () => {
    const mod = await import("../../src/lib/draft-state");
    const rosterMod = await import("../../src/lib/team-roster-state");
    mod.resetDraftStateForTests();
    rosterMod.resetTeamRosterStateForTests();

    const playerCatalog = [
      { id: "p-1", naam: "Budget Mid", club: "PSV", positie: "MID", prijs: 20 },
      { id: "p-2", naam: "Too Expensive", club: "AJA", positie: "FWD", prijs: 13 },
    ];

    mod.startDraft({ leagueId: "league-1", teamOrder: ["A", "B"], totalRounds: 2, startedBy: "admin-1" });
    mod.registerPick({ teamId: "A", playerId: "p-1", playerCatalog, budgetCap: 32 });
    mod.registerPick({ teamId: "B", playerId: "other" });

    expect(() => mod.registerPick({ teamId: "A", playerId: "p-2", playerCatalog, budgetCap: 32 })).toThrow(
      /transferbudget/i,
    );
    expect(rosterMod.readTeamRosterState().byTeamId.A).toEqual(["p-1"]);
  });

  it("blocks a draft pick when the position combination cannot fit any allowed formation", async () => {
    const mod = await import("../../src/lib/draft-state");
    const rosterMod = await import("../../src/lib/team-roster-state");
    mod.resetDraftStateForTests();
    rosterMod.resetTeamRosterStateForTests();

    const playerCatalog = [
      { id: "gk-1", naam: "Keeper 1", club: "PSV", positie: "GK", prijs: 1 },
      { id: "gk-2", naam: "Keeper 2", club: "AJA", positie: "GK", prijs: 1 },
      { id: "gk-3", naam: "Keeper 3", club: "FEY", positie: "GK", prijs: 1 },
    ];

    mod.startDraft({ leagueId: "league-1", teamOrder: ["A", "B"], totalRounds: 4, startedBy: "admin-1" });
    mod.registerPick({ teamId: "A", playerId: "gk-1", playerCatalog });
    mod.registerPick({ teamId: "B", playerId: "other-1" });
    mod.registerPick({ teamId: "A", playerId: "gk-2", playerCatalog });
    mod.registerPick({ teamId: "B", playerId: "other-2" });
    mod.registerPick({ teamId: "B", playerId: "other-3" });

    expect(() => mod.registerPick({ teamId: "A", playerId: "gk-3", playerCatalog })).toThrow(/formatie/i);
    expect(rosterMod.readTeamRosterState().byTeamId.A).toEqual(["gk-1", "gk-2"]);
  });

  it("blocks country stacking above two players from the same country", async () => {
    const mod = await import("../../src/lib/draft-state");
    const rosterMod = await import("../../src/lib/team-roster-state");
    mod.resetDraftStateForTests();
    rosterMod.resetTeamRosterStateForTests();

    const playerCatalog = [
      { id: "ned-1", naam: "Dutch One", club: "Nederland", positie: "MID", prijs: 1 },
      { id: "ned-2", naam: "Dutch Two", club: "Nederland", positie: "DEF", prijs: 1 },
      { id: "ned-3", naam: "Dutch Three", club: "Nederland", positie: "FWD", prijs: 1 },
    ];

    mod.startDraft({ leagueId: "league-1", teamOrder: ["A", "B"], totalRounds: 4, startedBy: "admin-1" });
    mod.registerPick({ teamId: "A", playerId: "ned-1", playerCatalog });
    mod.registerPick({ teamId: "B", playerId: "other-1" });
    mod.registerPick({ teamId: "A", playerId: "ned-2", playerCatalog });
    mod.registerPick({ teamId: "B", playerId: "other-2" });
    mod.registerPick({ teamId: "B", playerId: "other-3" });

    expect(() => mod.registerPick({ teamId: "A", playerId: "ned-3", playerCatalog })).toThrow(/maximaal 2 spelers per land/i);
    expect(rosterMod.readTeamRosterState().byTeamId.A).toEqual(["ned-1", "ned-2"]);
  });
});

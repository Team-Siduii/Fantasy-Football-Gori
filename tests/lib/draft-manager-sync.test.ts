import { beforeEach, describe, expect, it } from "vitest";

const JOHAN_EMAIL = "johan201@hotmail.com";

async function loadModules() {
  const draft = await import("../../src/lib/draft-state");
  const roster = await import("../../src/lib/team-roster-state");
  const manager = await import("../../src/lib/manager-state");
  const sync = await import("../../src/lib/draft-manager-sync");
  const league = await import("../../src/lib/league-admin-config");
  return { draft, roster, manager, sync, league };
}

describe("draft roster to manager team sync", () => {
  beforeEach(() => {
    process.env.DRAFT_STATE_PATH = "/tmp/ffg-draft-manager-sync-draft.test.json";
    process.env.DRAFT_STATE_WK_PATH = "/tmp/ffg-draft-manager-sync-draft-wk.test.json";
    process.env.TEAM_ROSTER_STATE_PATH = "/tmp/ffg-draft-manager-sync-roster.test.json";
    process.env.TEAM_ROSTER_STATE_WK_PATH = "/tmp/ffg-draft-manager-sync-roster-wk.test.json";
    process.env.MANAGER_STATE_PATH = "/tmp/ffg-draft-manager-sync-manager.test.json";
    process.env.MANAGER_STATE_WK_PATH = "/tmp/ffg-draft-manager-sync-manager-wk.test.json";
  });

  it("syncs WK picks for a draft team into that manager's My Team state", async () => {
    const { draft, roster, manager } = await loadModules();
    draft.resetDraftStateForTests("wk");
    roster.resetTeamRosterStateForTests("wk");
    manager.resetManagerStateForTests("wk");

    draft.startDraft({
      leagueId: "wk-2026",
      teamOrder: ["Johan Swart", "Thomas"],
      totalRounds: 2,
      startedBy: "admin-1",
      scope: "wk",
    });

    draft.registerPick({ teamId: "Johan Swart", playerId: "wk-player-1", scope: "wk" });

    const johanWkState = manager.readManagerState("wk", JOHAN_EMAIL);
    expect(johanWkState.lineupIds).toEqual(["wk-player-1"]);
    expect(johanWkState.benchIds).toEqual([]);
    expect(manager.readManagerState("eredivisie", JOHAN_EMAIL).lineupIds).toEqual([]);
  });

  it("removes a returned draft player from the manager's My Team state", async () => {
    const { draft, roster, manager } = await loadModules();
    draft.resetDraftStateForTests("wk");
    roster.resetTeamRosterStateForTests("wk");
    manager.resetManagerStateForTests("wk");

    draft.startDraft({
      leagueId: "wk-2026",
      teamOrder: ["Johan Swart", "Thomas"],
      totalRounds: 2,
      startedBy: "admin-1",
      scope: "wk",
    });

    draft.registerPick({ teamId: "Johan Swart", playerId: "wk-player-1", scope: "wk" });
    draft.returnPickedPlayerToPool({ teamId: "Johan Swart", playerId: "wk-player-1", reason: "test", scope: "wk" });

    const johanWkState = manager.readManagerState("wk", JOHAN_EMAIL);
    expect(johanWkState.lineupIds).toEqual([]);
    expect(johanWkState.benchIds).toEqual([]);
  });

  it("resets existing rosters and manager team state when a new WK draft starts", async () => {
    const { draft, roster, manager } = await loadModules();
    draft.resetDraftStateForTests("wk");
    roster.resetTeamRosterStateForTests("wk");
    manager.resetManagerStateForTests("wk");

    draft.startDraft({
      leagueId: "wk-2026-old",
      teamOrder: ["Johan Swart", "Thomas"],
      totalRounds: 2,
      startedBy: "admin-1",
      scope: "wk",
    });
    draft.registerPick({ teamId: "Johan Swart", playerId: "wk-player-1", scope: "wk" });

    draft.startDraft({
      leagueId: "wk-2026-new",
      teamOrder: ["Johan Swart", "Thomas"],
      totalRounds: 2,
      startedBy: "admin-1",
      scope: "wk",
    });

    expect(roster.readTeamRosterState("wk").byTeamId).toEqual({});
    const johanWkState = manager.readManagerState("wk", JOHAN_EMAIL);
    expect(johanWkState.lineupIds).toEqual([]);
    expect(johanWkState.benchIds).toEqual([]);
  });

  it("syncs draft teams from edited league participant labels to the right manager email", async () => {
    const { draft, roster, manager, league } = await loadModules();
    draft.resetDraftStateForTests("wk");
    roster.resetTeamRosterStateForTests("wk");
    manager.resetManagerStateForTests("wk");
    league.resetLeagueAdminConfigForTests("wk");

    league.updateLeagueAdminConfig(
      {
        participants: [
          { managerId: "johan-swart", label: "Johan's WK Team", email: "Johan201@hotmail.com", status: "ACCEPTED" },
          { managerId: "thomas-bart", label: "Thomas", email: "Thomasbart91@gmail.com", status: "ACCEPTED" },
        ],
      },
      "wk",
    );

    draft.startDraft({
      leagueId: "wk-2026-custom",
      teamOrder: ["Johan's WK Team", "Thomas"],
      totalRounds: 2,
      startedBy: "admin-1",
      scope: "wk",
    });

    draft.registerPick({ teamId: "Johan's WK Team", playerId: "wk-player-1", scope: "wk" });

    const johanWkState = manager.readManagerState("wk", JOHAN_EMAIL);
    expect(johanWkState.lineupIds).toEqual(["wk-player-1"]);
    expect(manager.readManagerState("wk", "Thomasbart91@gmail.com").lineupIds).toEqual([]);
  });

  it("repairs a manager My Team read from the draft roster when manager-state is stale", async () => {
    const { draft, roster, manager, sync } = await loadModules();
    draft.resetDraftStateForTests("wk");
    roster.resetTeamRosterStateForTests("wk");
    manager.resetManagerStateForTests("wk");

    draft.startDraft({
      leagueId: "wk-2026",
      teamOrder: ["Johan Swart", "Thomas"],
      totalRounds: 2,
      startedBy: "admin-1",
      scope: "wk",
    });
    draft.registerPick({ teamId: "Johan Swart", playerId: "wk-player-1", scope: "wk" });

    manager.resetManagerStateForTests("wk");
    expect(manager.readManagerState("wk", JOHAN_EMAIL).lineupIds).toEqual([]);

    const repaired = sync.syncManagerTeamFromDraftRoster({ managerEmail: JOHAN_EMAIL, scope: "wk" });

    expect(repaired?.changed).toBe(true);
    expect(manager.readManagerState("wk", JOHAN_EMAIL).lineupIds).toEqual(["wk-player-1"]);
  });

  it("updates round-scoped manager snapshots so draft picks are visible on My Team immediately", async () => {
    const { draft, roster, manager } = await loadModules();
    draft.resetDraftStateForTests("wk");
    roster.resetTeamRosterStateForTests("wk");
    manager.resetManagerStateForTests("wk");

    manager.saveManagerStateForRound(
      1,
      {
        formation: "4-3-3",
        lineupIds: ["old-player"],
        benchIds: [],
        pickedTransferId: null,
        pendingSellId: null,
        pendingBuyId: null,
      },
      "wk",
      true,
      JOHAN_EMAIL,
    );

    draft.startDraft({
      leagueId: "wk-2026",
      teamOrder: ["Johan Swart", "Thomas"],
      totalRounds: 2,
      startedBy: "admin-1",
      scope: "wk",
    });
    draft.registerPick({ teamId: "Johan Swart", playerId: "wk-player-1", scope: "wk" });

    expect(manager.readManagerState("wk", JOHAN_EMAIL).lineupIds).toEqual(["wk-player-1"]);
    expect(manager.readManagerStateForRound(1, "wk", JOHAN_EMAIL).lineupIds).toEqual(["wk-player-1"]);
  });
});

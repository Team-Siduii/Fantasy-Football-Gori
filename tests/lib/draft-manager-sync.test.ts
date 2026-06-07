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

  it("auto-fills picked players into a viable formation instead of only appending by pick order", async () => {
    const { draft, roster, manager } = await loadModules();
    draft.resetDraftStateForTests("wk");
    roster.resetTeamRosterStateForTests("wk");
    manager.resetManagerStateForTests("wk");

    const playerCatalog = [
      { id: "gk-1", naam: "Keeper", club: "Nederland", positie: "GK", prijs: 1 },
      { id: "def-1", naam: "Def 1", club: "België", positie: "DEF", prijs: 1 },
      { id: "def-2", naam: "Def 2", club: "Duitsland", positie: "DEF", prijs: 1 },
      { id: "def-3", naam: "Def 3", club: "Frankrijk", positie: "DEF", prijs: 1 },
      { id: "mid-1", naam: "Mid 1", club: "Spanje", positie: "MID", prijs: 1 },
      { id: "mid-2", naam: "Mid 2", club: "Portugal", positie: "MID", prijs: 1 },
      { id: "mid-3", naam: "Mid 3", club: "Italië", positie: "MID", prijs: 1 },
      { id: "mid-4", naam: "Mid 4", club: "Kroatië", positie: "MID", prijs: 1 },
      { id: "mid-5", naam: "Mid 5", club: "Marokko", positie: "MID", prijs: 1 },
      { id: "fwd-1", naam: "Fwd 1", club: "Argentinië", positie: "FWD", prijs: 1 },
      { id: "fwd-2", naam: "Fwd 2", club: "Brazilië", positie: "FWD", prijs: 1 },
    ];

    draft.startDraft({
      leagueId: "wk-2026",
      teamOrder: ["Johan Swart", "Thomas"],
      totalRounds: 11,
      startedBy: "admin-1",
      scope: "wk",
    });

    const johanPicks = ["gk-1", "def-1", "def-2", "def-3", "mid-1", "mid-2", "mid-3", "mid-4", "mid-5", "fwd-1", "fwd-2"];
    let johanIndex = 0;
    let otherIndex = 0;
    while (johanIndex < johanPicks.length) {
      const turn = draft.readDraftState("wk").currentTurnTeamId!;
      if (turn === "Johan Swart") {
        draft.registerPick({ teamId: turn, playerId: johanPicks[johanIndex], scope: "wk", playerCatalog });
        johanIndex += 1;
      } else {
        draft.registerPick({ teamId: turn, playerId: `other-${otherIndex}`, scope: "wk" });
        otherIndex += 1;
      }
    }

    const johanWkState = manager.readManagerState("wk", JOHAN_EMAIL);
    expect(johanWkState.formation).toBe("3-5-2");
    expect(johanWkState.lineupIds).toEqual(["gk-1", "def-1", "def-2", "def-3", "mid-1", "mid-2", "mid-3", "mid-4", "mid-5", "fwd-1", "fwd-2"]);
    expect(johanWkState.benchIds).toEqual([]);
  });
});

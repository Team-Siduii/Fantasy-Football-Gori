import { beforeEach, describe, expect, it } from "vitest";

const JOHAN_EMAIL = "johan201@hotmail.com";

async function loadModules() {
  const draft = await import("../../src/lib/draft-state");
  const roster = await import("../../src/lib/team-roster-state");
  const manager = await import("../../src/lib/manager-state");
  return { draft, roster, manager };
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
});

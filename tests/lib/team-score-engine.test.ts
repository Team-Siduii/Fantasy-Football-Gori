import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = "/tmp/ffg-team-score-engine-tests";
const MANAGER_STATE_WK_PATH = `${ROOT}/manager-state-wk.json`;
const TEAM_SCORE_STATE_WK_PATH = `${ROOT}/team-score-state-wk.json`;

async function loadModules() {
  const managerState = await import("../../src/lib/manager-state");
  const teamScoreState = await import("../../src/lib/team-score-state");
  const teamScoreEngine = await import("../../src/lib/team-score-engine");
  return { managerState, teamScoreState, teamScoreEngine };
}

describe("team score engine", () => {
  beforeEach(async () => {
    process.env.MANAGER_STATE_WK_PATH = MANAGER_STATE_WK_PATH;
    process.env.TEAM_SCORE_STATE_WK_PATH = TEAM_SCORE_STATE_WK_PATH;
    const { managerState, teamScoreState } = await loadModules();
    managerState.resetManagerStateForTests("wk");
    teamScoreState.resetTeamScoreStateForTests("wk");
  });

  it("keeps historical round scores stable after later transfers", async () => {
    const { managerState, teamScoreEngine, teamScoreState } = await loadModules();

    managerState.saveManagerStateForRound(
      1,
      {
        formation: "4-3-3",
        lineupIds: ["10", "11"],
        benchIds: ["12"],
      },
      "wk",
      false,
      "simon@example.com",
    );
    managerState.saveManagerStateForRound(
      2,
      {
        formation: "4-3-3",
        lineupIds: ["20", "21"],
        benchIds: ["22"],
      },
      "wk",
      false,
      "simon@example.com",
    );

    await teamScoreEngine.recalculateManagerRoundScorePersistent({
      scope: "wk",
      managerKey: "simon@example.com",
      roundNumber: 1,
      roundPointsByPlayerId: new Map([
        ["10", 5],
        ["11", 4],
        ["12", 3],
      ]),
    });
    await teamScoreEngine.recalculateManagerRoundScorePersistent({
      scope: "wk",
      managerKey: "simon@example.com",
      roundNumber: 2,
      roundPointsByPlayerId: new Map([
        ["20", 7],
        ["21", 2],
        ["22", 5],
      ]),
    });

    const round1 = await teamScoreState.getManagerRoundScorePersistent("wk", "simon@example.com", 1);
    const round2 = await teamScoreState.getManagerRoundScorePersistent("wk", "simon@example.com", 2);
    const summary = await teamScoreState.summarizeManagerTeamScoresPersistent("wk", "simon@example.com");

    expect(round1?.totalPoints).toBe(11);
    expect(round2?.totalPoints).toBe(12);
    expect(summary.totalPoints).toBe(23);
    expect(summary.currentRoundPoints).toBe(12);
  });

  it("computes bench points as half rounded up", async () => {
    const { teamScoreEngine } = await loadModules();

    const result = teamScoreEngine.computeTeamRoundScore({
      lineupIds: ["1", "2"],
      benchIds: ["3", "4"],
      pointsById: new Map([
        ["1", 4],
        ["2", 6],
        ["3", 3],
        ["4", 5],
      ]),
    });

    expect(result).toEqual({
      lineupPoints: 10,
      benchPoints: 5,
      totalPoints: 15,
    });
  });
});

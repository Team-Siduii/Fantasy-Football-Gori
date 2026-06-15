import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = "/tmp/ffg-team-score-state-tests";
const TEAM_SCORE_STATE_WK_PATH = `${ROOT}/team-score-state-wk.json`;

async function loadModules() {
  const teamScoreState = await import("../../src/lib/team-score-state");
  return { teamScoreState };
}

afterEach(() => {
  delete process.env.TEAM_SCORE_STATE_WK_PATH;
});

describe("team score state", () => {
  beforeEach(async () => {
    process.env.TEAM_SCORE_STATE_WK_PATH = TEAM_SCORE_STATE_WK_PATH;
    const { teamScoreState } = await loadModules();
    teamScoreState.resetTeamScoreStateForTests("wk");
  });

  it("stores snapshots per manager and round and summarizes totals", async () => {
    const { teamScoreState } = await loadModules();

    await teamScoreState.saveManagerRoundScoreSnapshotPersistent("wk", "Simon@Gmail.com", {
      roundNumber: 1,
      lineupIds: ["1"],
      benchIds: ["2"],
      lineupPoints: 8,
      benchPoints: 2,
      totalPoints: 10,
      calculatedAt: "2026-06-15T10:00:00.000Z",
      source: "wk-events-v1",
    });
    await teamScoreState.saveManagerRoundScoreSnapshotPersistent("wk", "Simon@Gmail.com", {
      roundNumber: 2,
      lineupIds: ["3"],
      benchIds: ["4"],
      lineupPoints: 6,
      benchPoints: 1,
      totalPoints: 7,
      calculatedAt: "2026-06-15T11:00:00.000Z",
      source: "wk-events-v1",
    });

    const storedRound1 = await teamScoreState.getManagerRoundScorePersistent("wk", "simon@gmail.com", 1);
    const summary = await teamScoreState.summarizeManagerTeamScoresPersistent("wk", "simon@gmail.com");

    expect(storedRound1?.totalPoints).toBe(10);
    expect(summary).toEqual({
      totalPoints: 17,
      currentRoundPoints: 7,
      roundsPlayed: 2,
      latestRound: 2,
    });
  });

  it("returns zero summary for unknown manager", async () => {
    const { teamScoreState } = await loadModules();
    await expect(teamScoreState.summarizeManagerTeamScoresPersistent("wk", "missing@example.com")).resolves.toEqual({
      totalPoints: 0,
      currentRoundPoints: 0,
      roundsPlayed: 0,
      latestRound: null,
    });
  });
});

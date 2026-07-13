import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({ Pool: class Pool {} }));

const getWkMatches = vi.fn();

vi.mock("../../src/lib/wk-sync-store", () => ({ getWkMatches }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("wk-player-availability", () => {
  it("resolves semifinal participants from finished quarterfinal results when the next round has no own snapshot yet", async () => {
    getWkMatches.mockResolvedValue([
      { match_id: 97, round: 6, home_team: "Argentinië", away_team: "Zwitserland", home_score: 2, away_score: 0, status: "FT" },
      { match_id: 98, round: 6, home_team: "Australië", away_team: "Colombia", home_score: 1, away_score: 3, status: "FT" },
      { match_id: 99, round: 6, home_team: "Nederland", away_team: "Portugal", home_score: 2, away_score: 1, status: "FT" },
      { match_id: 100, round: 6, home_team: "Brazilië", away_team: "Duitsland", home_score: 0, away_score: 1, status: "FT" },
    ]);

    const { getWkActiveTeamsForRound, isWkPlayerInactiveForRound } = await import("../../src/lib/wk-player-availability");
    const activeTeams = await getWkActiveTeamsForRound(7);

    expect(activeTeams).toEqual(new Set(["argentinie", "colombia", "nederland", "duitsland"]));
    expect(isWkPlayerInactiveForRound("Zwitserland", activeTeams)).toBe(true);
    expect(isWkPlayerInactiveForRound("Nederland", activeTeams)).toBe(false);
  });

  it("fails safe when a knockout feeder match is not finished yet", async () => {
    getWkMatches.mockResolvedValue([
      { match_id: 97, round: 6, home_team: "Argentinië", away_team: "Zwitserland", home_score: 1, away_score: 1, status: "NS" },
    ]);

    const { getWkActiveTeamsForRound } = await import("../../src/lib/wk-player-availability");

    await expect(getWkActiveTeamsForRound(7)).resolves.toBeNull();
  });
});

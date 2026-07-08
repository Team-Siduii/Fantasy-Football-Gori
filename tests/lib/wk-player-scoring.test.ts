import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getLatestSyncRound = vi.fn(async () => 5);
const getWkPlayerPointHistory = vi.fn(async () => []);
const getWkPlayerEvents = vi.fn(async () => []);

vi.mock("../../src/lib/wk-sync-store", () => ({
  getLatestSyncRound,
  getWkPlayerPointHistory,
  getWkPlayerEvents,
}));

vi.mock("../../src/lib/knockout-phase", () => ({
  isTeamEliminated: (club: string) => club === "Uitgeschakeld FC",
}));

async function loadModules() {
  const wkPlayerScoring = await import("../../src/lib/wk-player-scoring");
  return { wkPlayerScoring };
}

describe("wk player scoring", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("adds extra clean-sheet bonus for defenders based on events", async () => {
    const { wkPlayerScoring } = await loadModules();

    const points = wkPlayerScoring.calculateWkPlayerRoundPointsFromEvents({
      events: [
        { eventCode: "CS", points: 4 },
        { eventCode: "MD", points: 2 },
      ],
      position: "DEF",
      positionNl: "Verdediger",
    });

    expect(points).toBe(8);
  });

  it("does not add defender clean-sheet bonus for midfielders", async () => {
    const { wkPlayerScoring } = await loadModules();

    const points = wkPlayerScoring.calculateWkPlayerRoundPointsFromEvents({
      events: [
        { eventCode: "CS", points: 4 },
        { eventCode: "MD", points: 2 },
      ],
      position: "MID",
      positionNl: "Middenvelder",
    });

    expect(points).toBe(6);
  });

  it("keeps awarding round advancement to non-playing players whose country advances", async () => {
    getWkPlayerPointHistory.mockResolvedValue([
      {
        fantasyplayer_id: 295,
        round: 2,
        name: "Reece James",
        team_name: "Engeland",
        team_code: "ENG",
        position: "DEF",
        position_nl: "Verdediger",
        value: 10500000,
        has_played: false,
        num_played: 2,
      },
      {
        fantasyplayer_id: 240,
        round: 5,
        name: "Harry Kane",
        team_name: "Engeland",
        team_code: "ENG",
        position: "FWD",
        position_nl: "Aanvaller",
        value: 15000000,
        has_played: true,
        num_played: 4,
      },
    ]);
    getWkPlayerEvents.mockResolvedValue([
      { fantasyplayer_id: 240, round: 4, event_code: "MW", team_name: "Engeland", points: 3, minute: null },
      { fantasyplayer_id: 240, round: 5, event_code: "MW", team_name: "Engeland", points: 3, minute: null },
    ]);

    const { wkPlayerScoring } = await loadModules();
    const calculated = await wkPlayerScoring.buildCalculatedWkPlayerPointsMap(5);
    const reece = calculated.get(295);
    const roundPointsMap = await wkPlayerScoring.buildWkPlayerRoundPointsMap(5);
    const roundAdvancementMap = await wkPlayerScoring.buildWkPlayerRoundAdvancementPointsMap(5);

    expect(reece).toMatchObject({
      fantasyplayerId: 295,
      round: 5,
      roundPoints: 0,
      advancementPoints: 15,
      totalPoints: 15,
      hasPlayed: false,
      numPlayed: 2,
    });
    expect(roundPointsMap.get(295)).toBe(5);
    expect(roundAdvancementMap.get(295)).toBe(5);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getLatestSyncRound = vi.fn(async () => 5);
const getWkPlayerPointHistory = vi.fn(async () => []);
const getWkPlayerEvents = vi.fn(async () => []);
const getWkMatches = vi.fn(async () => []);

vi.mock("../../src/lib/wk-sync-store", () => ({
  getLatestSyncRound,
  getWkPlayerPointHistory,
  getWkPlayerEvents,
  getWkMatches,
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

  it("keeps awarding round advancement to players whose team advanced without an MW event in that round", async () => {
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
        fantasyplayer_id: 454,
        round: 2,
        name: "Gregor Kobel",
        team_name: "Zwitserland",
        team_code: "SUI",
        position: "GK",
        position_nl: "Keeper",
        value: 9000000,
        has_played: false,
        num_played: 2,
      },
      {
        fantasyplayer_id: 457,
        round: 2,
        name: "Breel Embolo",
        team_name: "Zwitserland",
        team_code: "SUI",
        position: "FWD",
        position_nl: "Aanvaller",
        value: 9000000,
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
      {
        fantasyplayer_id: 456,
        round: 5,
        name: "Granit Xhaka",
        team_name: "Zwitserland",
        team_code: "SUI",
        position: "MID",
        position_nl: "Middenvelder",
        value: 9000000,
        has_played: true,
        num_played: 4,
      },
    ] as any);
    getWkPlayerEvents.mockResolvedValue([
      { fantasyplayer_id: 240, round: 4, event_code: "MW", points: 3, minute: null },
      { fantasyplayer_id: 240, round: 5, event_code: "MW", points: 3, minute: null },
      { fantasyplayer_id: 456, round: 4, event_code: "MW", points: 3, minute: null },
      { fantasyplayer_id: 454, round: 5, event_code: "SSA", points: 4, minute: null },
      { fantasyplayer_id: 454, round: 5, event_code: "MD", points: 1, minute: null },
      { fantasyplayer_id: 454, round: 5, event_code: "CS", points: 5, minute: null },
      { fantasyplayer_id: 457, round: 5, event_code: "MD", points: 1, minute: null },
    ] as any);
    getWkMatches.mockResolvedValue([
      { match_id: 1, round: 6, home_team: 'Noorwegen', away_team: 'Engeland', home_score: 0, away_score: 0, synced_at: '2026-07-09T00:00:00.000Z' },
      { match_id: 2, round: 6, home_team: 'Argentinië', away_team: 'Zwitserland', home_score: 0, away_score: 0, synced_at: '2026-07-09T00:00:00.000Z' },
    ] as any);

    const { wkPlayerScoring } = await loadModules();
    const calculated = await wkPlayerScoring.buildCalculatedWkPlayerPointsMap(5);
    const reece = calculated.get(295);
    const kobel = calculated.get(454);
    const embolo = calculated.get(457);
    const roundPointsMap = await wkPlayerScoring.buildWkPlayerRoundPointsMap(5);
    const advancementMap = await wkPlayerScoring.buildWkPlayerAdvancementPointsMap(5);

    expect(reece).toMatchObject({ fantasyplayerId: 295, roundPoints: 0, advancementPoints: 15, totalPoints: 15, hasPlayed: false, numPlayed: 2 });
    expect(kobel).toMatchObject({ fantasyplayerId: 454, roundPoints: 10, advancementPoints: 15, totalPoints: 25, hasPlayed: false, numPlayed: 2 });
    expect(embolo).toMatchObject({ fantasyplayerId: 457, roundPoints: 1, advancementPoints: 15, totalPoints: 16, hasPlayed: false, numPlayed: 2 });
    expect(roundPointsMap.get(295)).toBe(5);
    expect(roundPointsMap.get(454)).toBe(15);
    expect(roundPointsMap.get(457)).toBe(6);
    expect(advancementMap.get(295)).toBe(15);
    expect(advancementMap.get(454)).toBe(15);
    expect(advancementMap.get(457)).toBe(15);
  });

  it("keeps historical total points but clears stale round points for players absent from the requested round", async () => {
    getWkPlayerPointHistory.mockResolvedValue([
      {
        fantasyplayer_id: 1301,
        round: 5,
        name: "Mostafa Ziko",
        team_name: "Egypte",
        team_code: "EGY",
        position: "MID",
        position_nl: "Middenvelder",
        value: 4500000,
        has_played: true,
        num_played: 4,
      },
      {
        fantasyplayer_id: 217,
        round: 6,
        name: "Lucas Digne",
        team_name: "Frankrijk",
        team_code: "FRA",
        position: "DEF",
        position_nl: "Verdediger",
        value: 10000000,
        has_played: true,
        num_played: 3,
      },
    ] as any);
    getWkPlayerEvents.mockResolvedValue([
      { fantasyplayer_id: 1301, round: 5, event_code: "G", points: 8, minute: 67 },
      { fantasyplayer_id: 217, round: 6, event_code: "CS", points: 3, minute: null, team_name: "Frankrijk" },
      { fantasyplayer_id: 217, round: 6, event_code: "MW", points: 3, minute: null, team_name: "Frankrijk" },
    ] as any);

    const { wkPlayerScoring } = await loadModules();
    const matched = await wkPlayerScoring.buildWkPlayerPointsByCsvId([
      { id: "1301", naam: "Mostafa Ziko", club: "Egypte" },
      { id: "217", naam: "Lucas Digne", club: "Frankrijk" },
    ], 6);

    expect(matched.roundPoints.get("1301") ?? 0).toBe(0);
    expect(matched.totalPoints.get("1301")).toBe(13);
    expect(matched.advancementPoints.get("1301") ?? 0).toBe(0);
    expect(matched.roundPoints.get("217")).toBeGreaterThan(0);
    expect(matched.totalPoints.get("217")).toBeGreaterThanOrEqual(matched.roundPoints.get("217") ?? 0);
  });

  it("ignores stale next-round participants when the current round already has explicit MW advancement events", async () => {
    getWkPlayerPointHistory.mockResolvedValue([
      {
        fantasyplayer_id: 201,
        round: 7,
        name: "Kylian Mbappé",
        team_name: "Frankrijk",
        team_code: "FRA",
        position: "FWD",
        position_nl: "Aanvaller",
        value: 15000000,
        has_played: true,
        num_played: 7,
      },
      {
        fantasyplayer_id: 202,
        round: 7,
        name: "Jude Bellingham",
        team_name: "Engeland",
        team_code: "ENG",
        position: "MID",
        position_nl: "Middenvelder",
        value: 14000000,
        has_played: true,
        num_played: 7,
      },
      {
        fantasyplayer_id: 203,
        round: 7,
        name: "Pedri",
        team_name: "Spanje",
        team_code: "ESP",
        position: "MID",
        position_nl: "Middenvelder",
        value: 12000000,
        has_played: true,
        num_played: 7,
      },
      {
        fantasyplayer_id: 204,
        round: 7,
        name: "Lionel Messi",
        team_name: "Argentinië",
        team_code: "ARG",
        position: "FWD",
        position_nl: "Aanvaller",
        value: 14000000,
        has_played: true,
        num_played: 7,
      },
    ] as any);
    getWkPlayerEvents.mockResolvedValue([
      { fantasyplayer_id: 203, round: 7, event_code: "MW", points: 3, minute: null },
      { fantasyplayer_id: 204, round: 7, event_code: "MW", points: 3, minute: null },
    ] as any);
    getWkMatches.mockResolvedValue([
      {
        match_id: 101,
        round: 7,
        home_team: "Frankrijk",
        away_team: "Spanje",
        home_team_code: "FRA",
        away_team_code: "ESP",
        home_score: 0,
        away_score: 2,
        status: "X",
        minute: null,
        kickoff_at: "2026-07-14T21:00:00Z",
        synced_at: "2026-07-17T18:00:00Z",
      },
      {
        match_id: 102,
        round: 7,
        home_team: "Engeland",
        away_team: "Argentinië",
        home_team_code: "ENG",
        away_team_code: "ARG",
        home_score: 1,
        away_score: 2,
        status: "X",
        minute: null,
        kickoff_at: "2026-07-15T21:00:00Z",
        synced_at: "2026-07-17T18:00:00Z",
      },
      {
        match_id: 103,
        round: 8,
        home_team: "Frankrijk",
        away_team: "Engeland",
        home_team_code: "FRA",
        away_team_code: "ENG",
        home_score: 0,
        away_score: 0,
        status: "F",
        minute: null,
        kickoff_at: "2026-07-18T21:00:00Z",
        synced_at: "2026-07-17T18:00:00Z",
      },
      {
        match_id: 104,
        round: 8,
        home_team: "Spanje",
        away_team: "Argentinië",
        home_team_code: "ESP",
        away_team_code: "ARG",
        home_score: 0,
        away_score: 0,
        status: "F",
        minute: null,
        kickoff_at: "2026-07-19T21:00:00Z",
        synced_at: "2026-07-17T18:00:00Z",
      },
    ] as any);

    const { wkPlayerScoring } = await loadModules();
    const advancementMap = await wkPlayerScoring.buildWkPlayerRoundAdvancementPointsMap(7);
    const roundPointsMap = await wkPlayerScoring.buildWkPlayerRoundPointsMap(7);

    expect(advancementMap.get(201)).toBe(0);
    expect(advancementMap.get(202)).toBe(0);
    expect(advancementMap.get(203)).toBe(5);
    expect(advancementMap.get(204)).toBe(5);
    expect(roundPointsMap.get(201)).toBe(0);
    expect(roundPointsMap.get(202)).toBe(0);
    expect(roundPointsMap.get(203)).toBe(8);
    expect(roundPointsMap.get(204)).toBe(8);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getLatestSyncRound = vi.fn(async () => 5);
const getWkPlayerPointHistory = vi.fn(async () => []);
const getWkPlayerEvents = vi.fn(async () => []);
const getWkMatches = vi.fn(async () => []);

vi.mock("../../src/lib/wk-sync-store", () => ({
  getLatestSyncRound,
  getWkMatches,
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

  it("keeps awarding round advancement to non-playing players when live MW events lack team_name", async () => {
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
      { fantasyplayer_id: 456, round: 5, event_code: "MW", points: 3, minute: null },
    ] as any);

    const { wkPlayerScoring } = await loadModules();
    const calculated = await wkPlayerScoring.buildCalculatedWkPlayerPointsMap(5);
    const reece = calculated.get(295);
    const kobel = calculated.get(454);
    const embolo = calculated.get(457);
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
    expect(kobel).toMatchObject({
      fantasyplayerId: 454,
      round: 5,
      roundPoints: 0,
      advancementPoints: 15,
      totalPoints: 15,
      hasPlayed: false,
      numPlayed: 2,
    });
    expect(embolo).toMatchObject({
      fantasyplayerId: 457,
      round: 5,
      roundPoints: 0,
      advancementPoints: 15,
      totalPoints: 15,
      hasPlayed: false,
      numPlayed: 2,
    });
    expect(roundPointsMap.get(295)).toBe(5);
    expect(roundPointsMap.get(454)).toBe(5);
    expect(roundPointsMap.get(457)).toBe(5);
    expect(roundAdvancementMap.get(295)).toBe(5);
    expect(roundAdvancementMap.get(454)).toBe(5);
    expect(roundAdvancementMap.get(457)).toBe(5);
  });

  it("falls back to next-round synced matches when MW advancement events are missing", async () => {
    getWkPlayerPointHistory.mockResolvedValue([
      {
        fantasyplayer_id: 101,
        round: 6,
        name: "Jules Koundé",
        team_name: "Frankrijk",
        team_code: "FRA",
        position: "DEF",
        position_nl: "Verdediger",
        value: 9500000,
        has_played: true,
        num_played: 6,
      },
      {
        fantasyplayer_id: 102,
        round: 6,
        name: "Marcus Rashford",
        team_name: "Engeland",
        team_code: "ENG",
        position: "FWD",
        position_nl: "Aanvaller",
        value: 7000000,
        has_played: true,
        num_played: 6,
      },
      {
        fantasyplayer_id: 103,
        round: 6,
        name: "Pedri",
        team_name: "Spanje",
        team_code: "ESP",
        position: "MID",
        position_nl: "Middenvelder",
        value: 7000000,
        has_played: true,
        num_played: 6,
      },
      {
        fantasyplayer_id: 104,
        round: 6,
        name: "Andreas Schjelderup",
        team_name: "Noorwegen",
        team_code: "NOR",
        position: "MID",
        position_nl: "Middenvelder",
        value: 7000000,
        has_played: true,
        num_played: 6,
      },
    ] as any);
    getWkPlayerEvents.mockResolvedValue([] as any);
    getWkMatches.mockResolvedValue([
      {
        match_id: 101,
        round: 7,
        home_team: "Frankrijk",
        away_team: "Engeland",
        home_team_code: "FRA",
        away_team_code: "ENG",
        home_score: null,
        away_score: null,
        status: "NS",
        minute: null,
        kickoff_at: "2026-07-14T19:00:00Z",
        synced_at: "2026-07-13T10:00:00Z",
      },
    ] as any);

    const { wkPlayerScoring } = await loadModules();
    const roundAdvancementMap = await wkPlayerScoring.buildWkPlayerRoundAdvancementPointsMap(6);
    const roundPointsMap = await wkPlayerScoring.buildWkPlayerRoundPointsMap(6);

    expect(roundAdvancementMap.get(101)).toBe(5);
    expect(roundAdvancementMap.get(102)).toBe(5);
    expect(roundAdvancementMap.get(103)).toBe(0);
    expect(roundAdvancementMap.get(104)).toBe(0);
    expect(roundPointsMap.get(101)).toBe(5);
    expect(roundPointsMap.get(102)).toBe(5);
    expect(roundPointsMap.get(103)).toBe(0);
    expect(roundPointsMap.get(104)).toBe(0);
  });

  it("ignores next-round fallback teams when the current round already has explicit MW advancement events", async () => {
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
    const roundAdvancementMap = await wkPlayerScoring.buildWkPlayerRoundAdvancementPointsMap(7);
    const roundPointsMap = await wkPlayerScoring.buildWkPlayerRoundPointsMap(7);

    expect(roundAdvancementMap.get(201)).toBe(0);
    expect(roundAdvancementMap.get(202)).toBe(0);
    expect(roundAdvancementMap.get(203)).toBe(5);
    expect(roundAdvancementMap.get(204)).toBe(5);
    expect(roundPointsMap.get(201)).toBe(0);
    expect(roundPointsMap.get(202)).toBe(0);
    expect(roundPointsMap.get(203)).toBe(8);
    expect(roundPointsMap.get(204)).toBe(8);
  });

  it("halves all troostfinale points and rounds the winner advancement bonus to 3 inside shared round 8", async () => {
    getLatestSyncRound.mockResolvedValueOnce(8);
    getWkPlayerPointHistory.mockResolvedValue([
      {
        fantasyplayer_id: 301,
        round: 8,
        name: "Bukayo Saka",
        team_name: "Engeland",
        team_code: "ENG",
        position: "MID",
        position_nl: "Middenvelder",
        value: 12000000,
        has_played: true,
        num_played: 8,
      },
      {
        fantasyplayer_id: 302,
        round: 8,
        name: "Aurélien Tchouaméni",
        team_name: "Frankrijk",
        team_code: "FRA",
        position: "MID",
        position_nl: "Middenvelder",
        value: 11000000,
        has_played: true,
        num_played: 8,
      },
      {
        fantasyplayer_id: 303,
        round: 7,
        name: "Lionel Messi",
        team_name: "Argentinië",
        team_code: "ARG",
        position: "FWD",
        position_nl: "Aanvaller",
        value: 15000000,
        has_played: true,
        num_played: 7,
      },
      {
        fantasyplayer_id: 303,
        round: 9,
        name: "Lionel Messi",
        team_name: "Argentinië",
        team_code: "ARG",
        position: "FWD",
        position_nl: "Aanvaller",
        value: 15000000,
        has_played: true,
        num_played: 8,
      },
    ] as any);
    getWkPlayerEvents.mockResolvedValue([
      { fantasyplayer_id: 301, round: 8, event_code: "GL", points: 5, minute: 55 },
      { fantasyplayer_id: 301, round: 8, event_code: "MW", points: 3, minute: null },
      { fantasyplayer_id: 302, round: 8, event_code: "GL", points: 5, minute: 61 },
      { fantasyplayer_id: 303, round: 9, event_code: "GL", points: 5, minute: 80 },
      { fantasyplayer_id: 303, round: 9, event_code: "MW", points: 3, minute: null },
    ] as any);
    getWkMatches.mockResolvedValue([
      {
        match_id: 201,
        round: 8,
        home_team: "Engeland",
        away_team: "Frankrijk",
        home_team_code: "ENG",
        away_team_code: "FRA",
        home_score: 2,
        away_score: 1,
        status: "F",
        minute: null,
        kickoff_at: "2026-07-18T19:00:00Z",
        synced_at: "2026-07-18T22:00:00Z",
      },
      {
        match_id: 202,
        round: 9,
        home_team: "Argentinië",
        away_team: "Spanje",
        home_team_code: "ARG",
        away_team_code: "ESP",
        home_score: 1,
        away_score: 0,
        status: "F",
        minute: null,
        kickoff_at: "2026-07-19T19:00:00Z",
        synced_at: "2026-07-19T22:00:00Z",
      },
    ] as any);

    const { wkPlayerScoring } = await loadModules();
    const roundPointsMap = await wkPlayerScoring.buildWkPlayerRoundPointsMap(8);
    const roundAdvancementMap = await wkPlayerScoring.buildWkPlayerRoundAdvancementPointsMap(8);
    const calculated = await wkPlayerScoring.buildCalculatedWkPlayerPointsMap(8);

    expect(roundAdvancementMap.get(301)).toBe(3);
    expect(roundAdvancementMap.get(302)).toBe(0);
    expect(roundAdvancementMap.get(303)).toBe(5);
    expect(roundPointsMap.get(301)).toBe(7);
    expect(roundPointsMap.get(302)).toBe(3);
    expect(roundPointsMap.get(303)).toBe(13);
    expect(calculated.get(301)).toMatchObject({ round: 8, roundPoints: 4, teamName: "Engeland" });
    expect(calculated.get(302)).toMatchObject({ round: 8, roundPoints: 3, teamName: "Frankrijk" });
    expect(calculated.get(303)).toMatchObject({ round: 8, roundPoints: 8, teamName: "Argentinië" });
  });

  it("treats the earliest live round-8 match as troostfinale when the provider no longer emits round 9", async () => {
    getLatestSyncRound.mockResolvedValueOnce(8);
    getWkPlayerPointHistory.mockResolvedValue([
      {
        fantasyplayer_id: 401,
        round: 8,
        name: "Bukayo Saka",
        team_name: "Engeland",
        team_code: "ENG",
        position: "FWD",
        position_nl: "Aanvaller",
        value: 12000000,
        has_played: true,
        num_played: 8,
      },
      {
        fantasyplayer_id: 402,
        round: 8,
        name: "Lamine Yamal",
        team_name: "Spanje",
        team_code: "ESP",
        position: "FWD",
        position_nl: "Aanvaller",
        value: 12000000,
        has_played: true,
        num_played: 8,
      },
    ] as any);
    getWkPlayerEvents.mockResolvedValue([
      { fantasyplayer_id: 401, round: 8, event_code: "G", points: 6, minute: 37 },
      { fantasyplayer_id: 401, round: 8, event_code: "MW", points: 3, minute: null },
      { fantasyplayer_id: 402, round: 8, event_code: "MW", points: 3, minute: null },
    ] as any);
    getWkMatches.mockResolvedValue([
      {
        match_id: 103,
        round: 8,
        home_team: "Frankrijk",
        away_team: "Engeland",
        home_team_code: "FRA",
        away_team_code: "ENG",
        home_score: 4,
        away_score: 6,
        status: "X",
        minute: null,
        kickoff_at: "2026-07-18T23:00:00+02:00",
        synced_at: "2026-07-18T22:00:00Z",
      },
      {
        match_id: 104,
        round: 8,
        home_team: "Spanje",
        away_team: "Argentinië",
        home_team_code: "ESP",
        away_team_code: "ARG",
        home_score: 1,
        away_score: 0,
        status: "X",
        minute: null,
        kickoff_at: "2026-07-19T21:00:00+02:00",
        synced_at: "2026-07-19T22:00:00Z",
      },
    ] as any);

    const { wkPlayerScoring } = await loadModules();
    const roundPointsMap = await wkPlayerScoring.buildWkPlayerRoundPointsMap(8);
    const roundAdvancementMap = await wkPlayerScoring.buildWkPlayerRoundAdvancementPointsMap(8);

    expect(roundPointsMap.get(401)).toBe(8);
    expect(roundAdvancementMap.get(401)).toBe(3);
    expect(roundPointsMap.get(402)).toBe(8);
    expect(roundAdvancementMap.get(402)).toBe(5);
  });
});

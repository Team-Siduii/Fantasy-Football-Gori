import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({ Pool: class Pool {} }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    }),
  },
}));

const listCalculatedWkPlayerPoints = vi.fn(async () => ([
  {
    fantasyplayerId: 1,
    round: 4,
    name: "Actieve speler",
    teamName: "Nederland",
    teamCode: "NL",
    position: "MID",
    positionNl: "MID",
    value: 10,
    roundPoints: 3,
    totalPoints: 12,
    advancementPoints: 20,
    hasPlayed: true,
    numPlayed: 1,
    pointEvents: [],
    source: "wk-events-v1" as const,
  },
]));
const buildWkPlayerPointsByCsvId = vi.fn(async () => ({
  roundPoints: new Map([["1", 8]]),
  totalPoints: new Map([["1", 12]]),
  advancementPoints: new Map([["1", 5]]),
}));
const getLeagueAdminConfigPersistent = vi.fn(async () => ({ budget: { priceOffsetMillions: 0 } }));
const getWkActiveTeamsForRound = vi.fn(async () => new Set(["Nederland", "Duitsland"]));
const isWkPlayerInactiveForRound = vi.fn((team: string) => team === "België" ? true : false);
const getWkMatches = vi.fn(async (round?: number) => round === 4
  ? [{ home_team: "Nederland", away_team: "Duitsland" }]
  : []);
const parsePlayerCsv = vi.fn(() => ({
  players: [
    { id: "1", naam: "Actieve speler", positie: "MID", club: "Nederland", prijs: 10 },
    { id: "2", naam: "Ontbrekende speler", positie: "DEF", club: "België", prijs: 8 },
  ],
}));
const readFile = vi.fn(async () => "id,naam\n1,test");

vi.mock("fs/promises", () => ({ readFile }));
vi.mock("@/domain/player-csv", () => ({ parsePlayerCsv }));
vi.mock("@/lib/player-bootstrap", () => ({ bootstrapPlayersFromDefaultCsv: vi.fn(async () => undefined) }));
vi.mock("@/lib/player-store", () => ({ listPlayers: vi.fn(() => []) }));
vi.mock("@/lib/league-admin-config", () => ({ getLeagueAdminConfigPersistent }));
vi.mock("../../../lib/wk-player-availability", () => ({ getWkActiveTeamsForRound, isWkPlayerInactiveForRound }));
vi.mock("@/lib/wk-player-scoring", () => ({ listCalculatedWkPlayerPoints, buildWkPlayerPointsByCsvId }));
vi.mock("@/lib/wk-sync-store", () => ({ getWkMatches }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/players", () => {
  it("marks WK players missing from the next-round snapshot as inactive", async () => {
    const { GET } = await import("../../src/app/api/players/route");

    const response = await GET(new Request("http://localhost/api/players?mode=wk&round=4"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(listCalculatedWkPlayerPoints).toHaveBeenCalledWith(4);
    expect(buildWkPlayerPointsByCsvId).toHaveBeenCalled();
    expect(payload.players).toHaveLength(2);
    expect(payload.players[0]).toMatchObject({ id: "1", inactive: false, totalPoints: 12, roundPoints: 8, advancementPoints: 5 });
    expect(payload.players[1]).toMatchObject({ id: "2", inactive: true, totalPoints: 0, advancementPoints: 0 });
  });
});

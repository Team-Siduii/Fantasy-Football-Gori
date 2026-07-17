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

const getLatestSyncRound = vi.fn(async () => 7);
const listCalculatedWkPlayerPoints = vi.fn(async () => {
  throw new Error("db offline");
});
const buildWkPlayerPointsByCsvId = vi.fn(async () => {
  throw new Error("db offline");
});
const getWkMatches = vi.fn(async () => {
  throw new Error("db offline");
});
const loadPlayerPoints = vi.fn(async () => {
  throw new Error("db offline");
});
const getWkActiveTeamsForRound = vi.fn(async () => null);
const isWkPlayerInactiveForRound = vi.fn(() => undefined);
const readFile = vi.fn(async () => "id,naam\n1,test");
const parsePlayerCsv = vi.fn(() => ({
  players: [{ id: "1", naam: "Speler 1", positie: "MID", club: "NL", prijs: 10 }],
}));

vi.mock("@/lib/wk-sync-store", () => ({
  getLatestSyncRound,
  getWkMatches,
}));
vi.mock("@/lib/wk-player-scoring", () => ({
  listCalculatedWkPlayerPoints,
  buildWkPlayerPointsByCsvId,
}));
vi.mock("@/lib/player-points-store", () => ({
  loadPlayerPoints,
}));
vi.mock("../../../lib/wk-player-availability", () => ({ getWkActiveTeamsForRound, isWkPlayerInactiveForRound }));
vi.mock("fs/promises", () => ({ readFile }));
vi.mock("@/domain/player-csv", () => ({ parsePlayerCsv }));
vi.mock("@/lib/player-bootstrap", () => ({ bootstrapPlayersFromDefaultCsv: vi.fn(async () => undefined) }));
vi.mock("@/lib/player-store", () => ({ listPlayers: vi.fn(() => []) }));
vi.mock("@/lib/league-admin-config", () => ({
  getLeagueAdminConfigPersistent: vi.fn(async () => ({ budget: { priceOffsetMillions: 0 } })),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("WK API fallback behavior when database-backed reads fail", () => {
  it("returns a non-breaking empty payload for /api/wk/players instead of 500", async () => {
    const { GET } = await import("../../src/app/api/wk/players/route");

    const response = await GET(new Request("http://localhost/api/wk/players?round=7"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      count: 0,
      players: [],
      source: "db-events",
      syncStatus: expect.stringContaining("unavailable"),
      lastSyncRound: 7,
    });
  });

  it("returns a non-breaking empty payload for /api/wk/matches instead of 500", async () => {
    const { GET } = await import("../../src/app/api/wk/matches/route");

    const response = await GET(new Request("http://localhost/api/wk/matches?round=7"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      count: 0,
      matches: [],
      source: "db",
      syncStatus: expect.stringContaining("unavailable"),
      lastSyncedAt: null,
    });
  });

  it("returns an empty snapshot for /api/wk/player-points when point storage throws", async () => {
    const { GET } = await import("../../src/app/api/wk/player-points/route");

    const response = await GET(new Request("http://localhost/api/wk/player-points?scope=wk"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      roundSequence: null,
      players: [],
      syncedAt: null,
      lastSync: null,
      syncStatus: expect.stringContaining("unavailable"),
    });
  });

  it("falls back to CSV players with zero points for /api/players?mode=wk when scoring storage throws", async () => {
    const { GET } = await import("../../src/app/api/players/route");

    const response = await GET(new Request("http://localhost/api/players?mode=wk&round=7"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.count).toBe(1);
    expect(payload.players[0]).toMatchObject({
      id: "1",
      naam: "Speler 1",
      punten: 0,
      totalPoints: 0,
      roundPoints: 0,
      advancementPoints: 0,
    });
    expect(payload.players[0].inactive).toBeUndefined();
    expect(payload.syncStatus).toContain("unavailable");
  });

  it("returns round-scoped advancement for /api/wk/players instead of cumulative advancement", async () => {
    listCalculatedWkPlayerPoints.mockImplementation(async (round?: number) => {
      if (round === 7) {
        return [
          {
            fantasyplayerId: 1,
            round: 7,
            name: "Kylian Mbappé",
            teamName: "Frankrijk",
            teamCode: "FRA",
            position: "FWD",
            positionNl: "Aanvaller",
            value: 15000000,
            roundPoints: 0,
            totalPoints: 90,
            advancementPoints: 20,
            hasPlayed: true,
            numPlayed: 7,
            pointEvents: [],
            source: "wk-events-v1",
          },
          {
            fantasyplayerId: 2,
            round: 7,
            name: "Lionel Messi",
            teamName: "Argentinië",
            teamCode: "ARG",
            position: "FWD",
            positionNl: "Aanvaller",
            value: 15000000,
            roundPoints: 2,
            totalPoints: 98,
            advancementPoints: 25,
            hasPlayed: true,
            numPlayed: 7,
            pointEvents: [],
            source: "wk-events-v1",
          },
        ];
      }
      if (round === 8) {
        return [
          {
            fantasyplayerId: 1,
            round: 8,
            name: "Kylian Mbappé",
            teamName: "Frankrijk",
            teamCode: "FRA",
            position: "FWD",
            positionNl: "Aanvaller",
            value: 15000000,
            roundPoints: 0,
            totalPoints: 90,
            advancementPoints: 20,
            hasPlayed: false,
            numPlayed: 7,
            pointEvents: [],
            source: "wk-events-v1",
          },
          {
            fantasyplayerId: 2,
            round: 8,
            name: "Lionel Messi",
            teamName: "Argentinië",
            teamCode: "ARG",
            position: "FWD",
            positionNl: "Aanvaller",
            value: 15000000,
            roundPoints: 0,
            totalPoints: 98,
            advancementPoints: 25,
            hasPlayed: false,
            numPlayed: 7,
            pointEvents: [],
            source: "wk-events-v1",
          },
        ];
      }
      return [];
    });

    const { GET } = await import("../../src/app/api/wk/players/route");
    const response = await GET(new Request("http://localhost/api/wk/players?round=8"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.players).toHaveLength(2);
    expect(payload.players[0]).toMatchObject({ name: "Kylian Mbappé", advancementPoints: 0 });
    expect(payload.players[1]).toMatchObject({ name: "Lionel Messi", advancementPoints: 0 });
  });
});

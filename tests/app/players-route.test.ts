import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const readFile = vi.fn(async () => "id,naam\n1,test");
const parsePlayerCsv = vi.fn(() => ({
  players: [
    { id: "1", naam: "Speler 1", positie: "MID", club: "NL", prijs: 10 },
    { id: "2", naam: "Speler 2", positie: "DEF", club: "NL", prijs: 8 },
  ],
}));
const getWkMatches = vi.fn(async () => []);
const listCalculatedWkPlayerPoints = vi.fn(async () => ([{
  fantasyplayerId: 1,
  round: 6,
  name: "Speler 1",
  teamName: "Nederland",
  teamCode: "NL",
  position: "MID",
  positionNl: "MID",
  value: 10,
  roundPoints: 0,
  totalPoints: 18,
  hasPlayed: false,
  numPlayed: 0,
  pointEvents: [],
  source: "wk-events-v1" as const,
}]));

vi.mock("fs/promises", () => ({ readFile }));
vi.mock("@/domain/player-csv", () => ({ parsePlayerCsv }));
vi.mock("@/lib/player-bootstrap", () => ({ bootstrapPlayersFromDefaultCsv: vi.fn(async () => undefined) }));
vi.mock("@/lib/player-store", () => ({ listPlayers: vi.fn(() => []) }));
vi.mock("@/lib/league-admin-config", () => ({
  getLeagueAdminConfigPersistent: vi.fn(async () => ({ budget: { priceOffsetMillions: 0 } })),
}));
vi.mock("@/lib/wk-player-scoring", () => ({ listCalculatedWkPlayerPoints }));
vi.mock("@/lib/wk-sync-store", () => ({ getWkMatches }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/players", () => {
  it("returns WK player round points for the requested round while preserving cumulative totalPoints", async () => {
    const { GET } = await import("../../src/app/api/players/route");

    const response = await GET(new Request("http://localhost/api/players?mode=wk&round=6"));
    const payload = await response.json();

    expect(listCalculatedWkPlayerPoints).toHaveBeenCalledWith(6);
    expect(payload.players[0]?.punten).toBe(18);
    expect(payload.players[0]?.roundPoints).toBe(0);
    expect(payload.players[0]?.totalPoints).toBe(18);
    expect(payload.players[0]?.prijs).toBe(7);
    expect(payload.players[0]?.isActive).toBe(true);
    expect(payload.players[1]?.isActive).toBe(false);
  });

  it("keeps all four finale/troostfinale teams active in shared round 8", async () => {
    parsePlayerCsv.mockReturnValueOnce({
      players: [
        { id: "10", naam: "Messi", positie: "FWD", club: "Argentinië", prijs: 15 },
        { id: "11", naam: "Saka", positie: "MID", club: "Engeland", prijs: 11 },
        { id: "12", naam: "Wirtz", positie: "MID", club: "Duitsland", prijs: 12 },
      ],
    });
    listCalculatedWkPlayerPoints.mockResolvedValueOnce([] as any);
    getWkMatches.mockResolvedValueOnce([
      {
        match_id: 101,
        round: 8,
        home_team: "Engeland",
        away_team: "Frankrijk",
        home_team_code: "ENG",
        away_team_code: "FRA",
        home_score: null,
        away_score: null,
        status: "NS",
        minute: null,
        kickoff_at: "2026-07-18T19:00:00Z",
        synced_at: "2026-07-18T12:00:00Z",
      },
      {
        match_id: 102,
        round: 9,
        home_team: "Argentinië",
        away_team: "Spanje",
        home_team_code: "ARG",
        away_team_code: "ESP",
        home_score: null,
        away_score: null,
        status: "NS",
        minute: null,
        kickoff_at: "2026-07-19T19:00:00Z",
        synced_at: "2026-07-18T12:00:00Z",
      },
    ] as any);

    const { GET } = await import("../../src/app/api/players/route");
    const response = await GET(new Request("http://localhost/api/players?mode=wk&round=8"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.players.map((player: any) => ({ naam: player.naam, isActive: player.isActive }))).toEqual([
      { naam: "Messi", isActive: true },
      { naam: "Saka", isActive: true },
      { naam: "Wirtz", isActive: false },
    ]);
  });
});

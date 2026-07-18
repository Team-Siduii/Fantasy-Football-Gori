import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const readFile = vi.fn(async () => "id,naam\n1,test");
const parsePlayerCsv = vi.fn(() => ({
  players: [
    { id: "1", naam: "Speler 1", positie: "MID", club: "NL", prijs: 10 },
    { id: "2", naam: "Speler 2", positie: "DEF", club: "NL", prijs: 8 },
  ],
}));
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
    expect(payload.players[0]?.isActive).toBe(true);
    expect(payload.players[1]?.isActive).toBe(false);
  });
});

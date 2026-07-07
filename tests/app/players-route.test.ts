import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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
    advancementPoints: 5,
    hasPlayed: true,
    numPlayed: 1,
    pointEvents: [],
    source: "wk-events-v1" as const,
  },
]));
const getLeagueAdminConfigPersistent = vi.fn(async () => ({ budget: { priceOffsetMillions: 0 } }));
const parsePlayerCsv = vi.fn(() => ({
  players: [
    { id: "1", naam: "Actieve speler", positie: "MID", club: "NL", prijs: 10 },
    { id: "2", naam: "Ontbrekende speler", positie: "DEF", club: "BE", prijs: 8 },
  ],
}));
const readFile = vi.fn(async () => "id,naam\n1,test");

vi.mock("fs/promises", () => ({ readFile }));
vi.mock("@/domain/player-csv", () => ({ parsePlayerCsv }));
vi.mock("@/lib/player-bootstrap", () => ({ bootstrapPlayersFromDefaultCsv: vi.fn(async () => undefined) }));
vi.mock("@/lib/player-store", () => ({ listPlayers: vi.fn(() => []) }));
vi.mock("@/lib/league-admin-config", () => ({ getLeagueAdminConfigPersistent }));
vi.mock("@/lib/wk-player-scoring", () => ({ listCalculatedWkPlayerPoints }));

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
    expect(payload.players).toHaveLength(2);
    expect(payload.players[0]).toMatchObject({ id: "1", inactive: false, totalPoints: 12, advancementPoints: 5 });
    expect(payload.players[1]).toMatchObject({ id: "2", inactive: true, totalPoints: 0, advancementPoints: 0 });
  });
});

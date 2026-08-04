import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getLatestSyncRound = vi.fn(async () => 8);
const listCalculatedWkPlayerPoints = vi.fn(async () => ([
  {
    fantasyplayerId: 10,
    round: 8,
    name: "Kylian Mbappé",
    teamName: "Frankrijk",
    teamCode: "FRA",
    position: "FWD",
    positionNl: "FWD",
    value: 13_500_000,
    roundPoints: 9,
    totalPoints: 63,
    hasPlayed: true,
    numPlayed: 7,
    pointEvents: [],
    source: "wk-events-v1" as const,
  },
]));

vi.mock("@/lib/wk-sync-store", () => ({
  getLatestSyncRound,
}));
vi.mock("@/lib/wk-player-scoring", () => ({
  listCalculatedWkPlayerPoints,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/wk/players", () => {
  it("normaliseert WK transferwaardes altijd naar importwaarde min 3 miljoen", async () => {
    const { GET } = await import("../../src/app/api/wk/players/route");

    const response = await GET(new Request("http://localhost/api/wk/players?round=8"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(listCalculatedWkPlayerPoints).toHaveBeenCalledWith(8);
    expect(payload.players[0]).toMatchObject({
      name: "Kylian Mbappé",
      value: 10_500_000,
      roundPoints: 9,
      totalPoints: 63,
    });
    expect(payload.lastSyncRound).toBe(8);
  });
});

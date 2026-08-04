import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getWkMatches = vi.fn(async () => []);

vi.mock("@/lib/wk-sync-store", () => ({
  getWkMatches,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/wk/matches", () => {
  it("combines finale and troostfinale into shared round 8 payload", async () => {
    getWkMatches.mockResolvedValueOnce([
      {
        match_id: 101,
        round: 8,
        home_team: "Engeland",
        away_team: "Frankrijk",
        home_team_code: "ENG",
        away_team_code: "FRA",
        home_score: 1,
        away_score: 0,
        status: "F",
        minute: null,
        kickoff_at: "2026-07-18T19:00:00Z",
        synced_at: "2026-07-18T22:00:00Z",
      },
      {
        match_id: 102,
        round: 9,
        home_team: "Argentinië",
        away_team: "Spanje",
        home_team_code: "ARG",
        away_team_code: "ESP",
        home_score: 2,
        away_score: 1,
        status: "F",
        minute: null,
        kickoff_at: "2026-07-19T19:00:00Z",
        synced_at: "2026-07-19T22:00:00Z",
      },
    ] as any);

    const { GET } = await import("../../src/app/api/wk/matches/route");
    const response = await GET(new Request("http://localhost/api/wk/matches?round=8"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.count).toBe(2);
    expect(payload.matches.map((match: any) => match.round)).toEqual([8, 8]);
    expect(payload.matches.map((match: any) => `${match.homeTeam}-${match.awayTeam}`)).toEqual([
      "Engeland-Frankrijk",
      "Argentinië-Spanje",
    ]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-session", () => ({
  getAuthenticatedEmail: vi.fn(async () => "emielzomerdijk@gmail.com"),
}));

const buildLeagueRankingSnapshot = vi.fn(async () => ({ ranking: [], allSubpoules: {}, allRanking: [] }));

vi.mock("@/lib/league-ranking", () => ({
  buildLeagueRankingSnapshot,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/manager/league-ranking", () => {
  it("passes the selected roundNumber through to the ranking read-model", async () => {
    const { GET } = await import("../../src/app/api/manager/league-ranking/route");

    const response = await GET(new Request("http://localhost/api/manager/league-ranking?mode=wk&roundNumber=7"));

    expect(response.status).toBe(200);
    expect(buildLeagueRankingSnapshot).toHaveBeenCalledWith("wk", "emielzomerdijk@gmail.com", 7);
  });
});

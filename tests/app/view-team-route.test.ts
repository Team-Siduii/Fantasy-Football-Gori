import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const syncManagerTeamFromDraftRosterPersistent = vi.fn(async () => ({ changed: true }));
const readManagerStatePersistent = vi.fn(async () => ({
  formation: "4-3-3",
  lineupIds: ["wk-player-1"],
  benchIds: [],
  pendingSellId: null,
  pendingBuyId: null,
}));
const getAuthenticatedEmail = vi.fn(async () => "s.j.m.duindam@gmail.com");
const ensureAuthStateFromDb = vi.fn(async () => undefined);
const getProfileByEmail = vi.fn(() => ({ name: "Simon", teamName: "Simons Team" }));
const summarizeManagerTeamScoresPersistent = vi.fn(async () => ({ totalPoints: 42, currentRoundPoints: 12 }));
const buildWkPlayerTotalPointsMapThroughRound = vi.fn(async () => new Map([["wk-player-1", 42]]));
const parsePlayerCsv = vi.fn(() => ({
  players: [{ id: "wk-player-1", naam: "Speler 1", positie: "MID", club: "NL", prijs: 10 }],
}));
const readFile = vi.fn(async () => "id,naam\n1,test");

vi.mock("fs/promises", () => ({
  readFile,
}));

vi.mock("@/domain/player-csv", () => ({
  parsePlayerCsv,
}));

vi.mock("@/domain/team-budget", () => ({
  getTransferBudgetCapMillions: () => 100,
}));

vi.mock("@/lib/auth-store", () => ({
  ensureAuthStateFromDb,
  getProfileByEmail,
}));

vi.mock("@/lib/auth-session", () => ({
  getAuthenticatedEmail,
}));

vi.mock("@/lib/draft-manager-sync", () => ({
  syncManagerTeamFromDraftRosterPersistent,
}));

vi.mock("@/lib/manager-state", () => ({
  readManagerStatePersistent,
}));

vi.mock("@/lib/player-points-store", () => ({
  loadPlayerPoints: vi.fn(async () => null),
}));

vi.mock("@/lib/team-score-state", () => ({
  summarizeManagerTeamScoresPersistent,
}));

vi.mock("@/lib/wk-player-scoring", () => ({
  buildWkPlayerTotalPointsMapThroughRound,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/manager/view-team", () => {
  it("repairs the manager team from draft roster before reading WK view-team state", async () => {
    const { GET } = await import("../../src/app/api/manager/view-team/route");

    const response = await GET(
      new Request("http://localhost/api/manager/view-team?mode=wk&email=s.j.m.duindam@gmail.com"),
    );
    const payload = await response.json();

    expect(syncManagerTeamFromDraftRosterPersistent).toHaveBeenCalledWith({
      managerEmail: "s.j.m.duindam@gmail.com",
      scope: "wk",
    });
    expect(readManagerStatePersistent).toHaveBeenCalledWith("wk", "s.j.m.duindam@gmail.com");
    expect(payload.lineup).toHaveLength(1);
    expect(payload.teamTotalPoints).toBe(42);
  });
});

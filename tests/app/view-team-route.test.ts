import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const repairManagerTeamFromDraftArtifactsPersistent = vi.fn(async () => ({ changed: true }));
const readTeamViewSnapshotPersistent = vi.fn(async () => ({
  formation: "4-3-3",
  lineupIds: ["wk-player-1"],
  benchIds: ["wk-player-2"],
  pendingSellId: null,
  pendingBuyId: null,
}));
const getAuthenticatedEmail = vi.fn(async () => "s.j.m.duindam@gmail.com");
const ensureAuthStateFromDb = vi.fn(async () => undefined);
const getProfileByEmail = vi.fn(() => ({ name: "Simon", teamName: "Simons Team" }));
const summarizeManagerTeamScoresPersistent = vi.fn(async () => ({ totalPoints: 42, currentRoundPoints: 12 }));
const getManagerRoundScorePersistent = vi.fn(async () => ({ totalPoints: 42, roundNumber: 1, lineupPoints: 42, benchPoints: 0, lineupIds: ["wk-player-1"], benchIds: ["wk-player-2"], calculatedAt: "", source: "test" }));
const getWkMatches = vi.fn(async (round?: number) => round === 1
  ? [{ home_team: "Spelerland 1", away_team: "Anderland" }]
  : []);
const buildWkPlayerPointsByCsvId = vi.fn(async () => ({
  roundPoints: new Map([["wk-player-1", 0]]),
  totalPoints: new Map([["wk-player-1", 42]]),
  advancementPoints: new Map<string, number>(),
}));
const parsePlayerCsv = vi.fn(() => ({
  players: [
    { id: "wk-player-1", naam: "Speler 1", positie: "MID", club: "Spelerland 1", prijs: 10 },
    { id: "wk-player-2", naam: "Speler 2", positie: "DEF", club: "België", prijs: 8 },
  ],
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
  repairManagerTeamFromDraftArtifactsPersistent,
}));

vi.mock("@/lib/manager-team-state-source", () => ({
  readTeamViewSnapshotPersistent,
}));

vi.mock("@/lib/player-points-store", () => ({
  loadPlayerPoints: vi.fn(async () => null),
}));

vi.mock("@/lib/team-score-state", () => ({
  summarizeManagerTeamScoresPersistent,
  getManagerRoundScorePersistent,
}));

vi.mock("@/lib/wk-sync-store", () => ({
  getWkMatches,
}));

vi.mock("@/lib/wk-player-scoring", () => ({
  buildWkPlayerPointsByCsvId,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/manager/view-team", () => {
  it("keeps the stored WK formation and repairs team state before reading", async () => {
    const { GET } = await import("../../src/app/api/manager/view-team/route");

    const response = await GET(
      new Request("http://localhost/api/manager/view-team?mode=wk&email=s.j.m.duindam@gmail.com&roundNumber=1"),
    );
    const payload = await response.json();

    expect(repairManagerTeamFromDraftArtifactsPersistent).toHaveBeenCalledWith({
      managerEmail: "s.j.m.duindam@gmail.com",
      scope: "wk",
    });
    expect(readTeamViewSnapshotPersistent).toHaveBeenCalledWith({
      scope: "wk",
      managerEmail: "s.j.m.duindam@gmail.com",
      roundNumber: 1,
    });
    expect(repairManagerTeamFromDraftArtifactsPersistent.mock.invocationCallOrder[0]).toBeLessThan(
      readTeamViewSnapshotPersistent.mock.invocationCallOrder[0],
    );
    expect(payload.formation).toBe("4-3-3");
    expect(payload.roundNumber).toBe(1);
    expect(payload.lineup).toHaveLength(1);
    expect(payload.lineup[0]?.punten).toBe(0);
    expect(payload.lineup[0]?.totalPoints).toBe(42);
    expect(payload.lineup[0]?.inactive).toBe(false);
    expect(payload.bench).toHaveLength(1);
    expect(payload.bench[0]?.inactive).toBe(true);
    expect(payload.teamTotalPoints).toBe(42);
  });

  it("prefers freshly computed selected-round WK totals over stale persisted team-score snapshots", async () => {
    buildWkPlayerPointsByCsvId.mockResolvedValueOnce({
      roundPoints: new Map([["wk-player-1", 8], ["wk-player-2", 0]]),
      totalPoints: new Map([["wk-player-1", 52], ["wk-player-2", 16]]),
      advancementPoints: new Map([["wk-player-1", 5], ["wk-player-2", 0]]),
    });
    getManagerRoundScorePersistent.mockResolvedValueOnce({
      totalPoints: 33,
      roundNumber: 6,
      lineupPoints: 33,
      benchPoints: 0,
      lineupIds: ["wk-player-1"],
      benchIds: ["wk-player-2"],
      calculatedAt: "",
      source: "stale-test-snapshot",
    });

    const { GET } = await import("../../src/app/api/manager/view-team/route");

    const response = await GET(
      new Request("http://localhost/api/manager/view-team?mode=wk&email=s.j.m.duindam@gmail.com&roundNumber=6"),
    );
    const payload = await response.json();

    expect(payload.lineup[0]).toMatchObject({ punten: 8, totalPoints: 52, advancementPoints: 5 });
    expect(payload.bench[0]).toMatchObject({ punten: 0, totalPoints: 16, advancementPoints: 0 });
    expect(payload.teamCurrentRoundPoints).toBe(8);
    expect(payload.teamTotalPoints).toBe(60);
  });
});

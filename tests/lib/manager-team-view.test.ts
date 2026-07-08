import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const readTeamViewSnapshotPersistent = vi.fn(async () => ({
  formation: "3-4-3",
  lineupIds: ["1"],
  benchIds: ["2"],
  pendingSellId: "2",
  pendingBuyId: "buy-player-1",
  pickedTransferId: null,
}));
const summarizeManagerTeamScoresPersistent = vi.fn(async () => ({ totalPoints: 42, currentRoundPoints: 12 }));
const getManagerRoundScorePersistent = vi.fn(async () => ({ totalPoints: 9 }));
const buildWkPlayerRoundAdvancementPointsMap = vi.fn(async () => new Map([[1, 5], [2, 5]]));
const buildWkPlayerRoundPointsMap = vi.fn(async () => new Map([[1, 5]]));
const buildWkPlayerTotalPointsMapThroughRound = vi.fn(async () => new Map([[1, 42]]));
const listCalculatedWkPlayerPoints = vi.fn(async () => ([{
  fantasyplayerId: 1,
  round: 2,
  name: "Speler 1",
  teamName: "Nederland",
  teamCode: "NL",
  position: "MID",
  positionNl: "MID",
  value: 10,
  roundPoints: 5,
  totalPoints: 42,
  advancementPoints: 5,
  hasPlayed: true,
  numPlayed: 1,
  pointEvents: [],
  source: "wk-events-v1" as const,
}]));
const parsePlayerCsv = vi.fn(() => ({
  players: [
    { id: "1", naam: "Speler 1", positie: "MID", club: "NL", prijs: 10 },
    { id: "2", naam: "Bankspeler", positie: "MID", club: "NL", prijs: 8 },
  ],
}));
const readFile = vi.fn(async () => "id,naam\n1,Speler 1");

vi.mock("../../src/lib/manager-team-state-source", () => ({
  readTeamViewSnapshotPersistent,
}));

vi.mock("../../src/lib/team-score-state", () => ({
  summarizeManagerTeamScoresPersistent,
  getManagerRoundScorePersistent,
}));

vi.mock("../../src/lib/wk-player-scoring", () => ({
  buildWkPlayerRoundAdvancementPointsMap,
  buildWkPlayerRoundPointsMap,
  buildWkPlayerTotalPointsMapThroughRound,
  listCalculatedWkPlayerPoints,
}));

vi.mock("../../src/domain/player-csv", () => ({
  parsePlayerCsv,
}));

vi.mock("fs/promises", () => ({
  readFile,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("buildManagerTeamViewPersistent", () => {
  it("hydrates the saved WK snapshot server-side using the selected round scoring maps", async () => {
    const { buildManagerTeamViewPersistent } = await import("../../src/lib/manager-team-view");

    const result = await buildManagerTeamViewPersistent({
      scope: "wk",
      managerEmail: "s.j.m.duindam@gmail.com",
      roundNumber: 2,
    });

    expect(readTeamViewSnapshotPersistent).toHaveBeenCalledWith({
      scope: "wk",
      managerEmail: "s.j.m.duindam@gmail.com",
      roundNumber: 2,
    });
    expect(buildWkPlayerRoundPointsMap).toHaveBeenCalledWith(2);
    expect(buildWkPlayerTotalPointsMapThroughRound).toHaveBeenCalledWith(2);
    expect(buildWkPlayerRoundAdvancementPointsMap).toHaveBeenCalledWith(2);
    expect(listCalculatedWkPlayerPoints).toHaveBeenCalledWith(2);
    expect(getManagerRoundScorePersistent).toHaveBeenCalledWith("wk", "s.j.m.duindam@gmail.com", 2);
    expect(result.lineup[0]).toMatchObject({ id: "1", punten: 5, roundPoints: 5, totalPoints: 42, advancementPoints: 5, isActive: true });
    expect(result.bench[0]).toMatchObject({ id: "2", punten: 0, roundPoints: 0, totalPoints: 0, advancementPoints: 5, isActive: false });
    expect(result.teamCurrentRoundPoints).toBe(9);
    expect(result.pendingSellId).toBe("2");
    expect(result.pendingBuyId).toBe("buy-player-1");
    expect(result.hasPersistedPlayers).toBe(true);
  });
});

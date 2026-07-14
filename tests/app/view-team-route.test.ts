import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  },
}));

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
const getWkActiveTeamsForRound = vi.fn(async (round?: number) => {
  if (round === 1) return new Set(["spelerland 1", "anderland"]);
  if (round === 6) return new Set(["spelerland 1"]);
  return null;
});
const isWkPlayerInactiveForRound = vi.fn((club: string, activeTeamsForRound: Set<string> | null) => {
  if (!activeTeamsForRound || activeTeamsForRound.size === 0) return undefined;
  return !activeTeamsForRound.has(club.trim().toLowerCase());
});
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

vi.mock("@/lib/inactive-players", () => ({
  getInactivePlayer: vi.fn(() => null),
}));

vi.mock("@/lib/manager-team-hydration", async () => {
  const actual = await import("../../src/lib/manager-team-hydration");
  return actual;
});

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

vi.mock("../../src/lib/wk-player-availability", () => ({
  getWkActiveTeamsForRound,
  isWkPlayerInactiveForRound,
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
    expect(payload.lineup).toHaveLength(11);
    expect(payload.bench).toHaveLength(4);
    expect(payload.lineup.some((player: { id: string }) => player.id === "wk-player-1")).toBe(true);
    expect(payload.lineup.some((player: { id: string }) => player.id === "wk-player-2")).toBe(true);
    expect(payload.teamTotalPoints).toBe(42);
  });

  it("rebalances malformed WK snapshots so the lineup stays position-valid", async () => {
    readTeamViewSnapshotPersistent.mockResolvedValueOnce({
      formation: "4-3-3",
      lineupIds: ["mid-1", "def-1", "fwd-1", "def-2", "mid-2", "def-3", "fwd-2", "fwd-3", "def-4", "gk-1", "fwd-4"],
      benchIds: ["mid-3", "gk-2", "def-5", "mid-4"],
      pendingSellId: null,
      pendingBuyId: null,
    });
    parsePlayerCsv.mockReturnValueOnce({
      players: [
        { id: "gk-1", naam: "Starting Keeper", positie: "GK", club: "Spelerland 1", prijs: 10 },
        { id: "def-1", naam: "Defender 1", positie: "DEF", club: "Spelerland 1", prijs: 8 },
        { id: "def-2", naam: "Defender 2", positie: "DEF", club: "Spelerland 1", prijs: 8 },
        { id: "def-3", naam: "Defender 3", positie: "DEF", club: "Spelerland 1", prijs: 8 },
        { id: "def-4", naam: "Defender 4", positie: "DEF", club: "Spelerland 1", prijs: 8 },
        { id: "mid-1", naam: "Midfielder 1", positie: "MID", club: "Spelerland 1", prijs: 7 },
        { id: "mid-2", naam: "Midfielder 2", positie: "MID", club: "Spelerland 1", prijs: 7 },
        { id: "mid-3", naam: "Bench Midfielder", positie: "MID", club: "Spelerland 1", prijs: 7 },
        { id: "mid-4", naam: "Reserve Midfielder", positie: "MID", club: "Spelerland 2", prijs: 6 },
        { id: "fwd-1", naam: "Forward 1", positie: "FWD", club: "Spelerland 1", prijs: 9 },
        { id: "fwd-2", naam: "Forward 2", positie: "FWD", club: "Spelerland 1", prijs: 9 },
        { id: "fwd-3", naam: "Forward 3", positie: "FWD", club: "Spelerland 1", prijs: 9 },
        { id: "fwd-4", naam: "Extra Forward", positie: "FWD", club: "Spelerland 2", prijs: 9 },
        { id: "gk-2", naam: "Bench Keeper", positie: "GK", club: "Spelerland 2", prijs: 5 },
        { id: "def-5", naam: "Bench Defender", positie: "DEF", club: "Spelerland 2", prijs: 5 },
      ],
    });
    buildWkPlayerPointsByCsvId.mockResolvedValueOnce({
      roundPoints: new Map(),
      totalPoints: new Map(),
      advancementPoints: new Map(),
    });
    getManagerRoundScorePersistent.mockResolvedValueOnce({
      totalPoints: 0,
      roundNumber: 6,
      lineupPoints: 0,
      benchPoints: 0,
      lineupIds: [],
      benchIds: [],
      calculatedAt: "",
      source: "test",
    });

    const { GET } = await import("../../src/app/api/manager/view-team/route");

    const response = await GET(
      new Request("http://localhost/api/manager/view-team?mode=wk&email=s.j.m.duindam@gmail.com&roundNumber=6"),
    );
    const payload = await response.json();

    expect(payload.lineup.map((player: { positie: string }) => player.positie)).toEqual(["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD"]);
    expect(payload.lineup.map((player: { id: string }) => player.id)).toEqual(["gk-1", "def-1", "def-2", "def-3", "def-4", "mid-1", "mid-2", "mid-3", "fwd-1", "fwd-2", "fwd-3"]);
    expect(payload.bench.map((player: { id: string }) => player.id)).toEqual(["fwd-4", "gk-2", "def-5", "mid-4"]);
  });

  it("prefers freshly computed selected-round WK totals over stale persisted team-score snapshots", async () => {
    readTeamViewSnapshotPersistent.mockResolvedValueOnce({
      formation: "4-3-3",
      lineupIds: ["gk-1", "def-1", "def-2", "def-3", "def-4", "mid-1", "mid-2", "mid-3", "fwd-1", "fwd-2", "fwd-3"],
      benchIds: ["gk-2", "def-5", "mid-4", "fwd-4"],
      pendingSellId: null,
      pendingBuyId: null,
    });
    parsePlayerCsv.mockReturnValueOnce({
      players: [
        { id: "gk-1", naam: "Starting Keeper", positie: "GK", club: "Spelerland 1", prijs: 10 },
        { id: "def-1", naam: "Defender 1", positie: "DEF", club: "Spelerland 1", prijs: 8 },
        { id: "def-2", naam: "Defender 2", positie: "DEF", club: "Spelerland 1", prijs: 8 },
        { id: "def-3", naam: "Defender 3", positie: "DEF", club: "Spelerland 1", prijs: 8 },
        { id: "def-4", naam: "Defender 4", positie: "DEF", club: "Spelerland 1", prijs: 8 },
        { id: "mid-1", naam: "Midfielder 1", positie: "MID", club: "Spelerland 1", prijs: 7 },
        { id: "mid-2", naam: "Midfielder 2", positie: "MID", club: "Spelerland 1", prijs: 7 },
        { id: "mid-3", naam: "Midfielder 3", positie: "MID", club: "Spelerland 1", prijs: 7 },
        { id: "fwd-1", naam: "Forward 1", positie: "FWD", club: "Spelerland 1", prijs: 9 },
        { id: "fwd-2", naam: "Forward 2", positie: "FWD", club: "Spelerland 1", prijs: 9 },
        { id: "fwd-3", naam: "Forward 3", positie: "FWD", club: "Spelerland 1", prijs: 9 },
        { id: "gk-2", naam: "Bench Keeper", positie: "GK", club: "Spelerland 1", prijs: 5 },
        { id: "def-5", naam: "Bench Defender", positie: "DEF", club: "Spelerland 1", prijs: 5 },
        { id: "mid-4", naam: "Reserve Midfielder", positie: "MID", club: "Spelerland 1", prijs: 5 },
        { id: "fwd-4", naam: "Reserve Forward", positie: "FWD", club: "Spelerland 1", prijs: 5 },
      ],
    });
    buildWkPlayerPointsByCsvId.mockResolvedValueOnce({
      roundPoints: new Map([["gk-1", 8], ["gk-2", 1]]),
      totalPoints: new Map([["gk-1", 52], ["gk-2", 16]]),
      advancementPoints: new Map([["gk-1", 5], ["gk-2", 5]]),
    });
    getManagerRoundScorePersistent.mockResolvedValueOnce({
      totalPoints: 33,
      roundNumber: 6,
      lineupPoints: 33,
      benchPoints: 0,
      lineupIds: ["gk-1"],
      benchIds: ["gk-2"],
      calculatedAt: "",
      source: "stale-test-snapshot",
    });

    const { GET } = await import("../../src/app/api/manager/view-team/route");

    const response = await GET(
      new Request("http://localhost/api/manager/view-team?mode=wk&email=s.j.m.duindam@gmail.com&roundNumber=6"),
    );
    const payload = await response.json();

    const lineupKeeper = payload.lineup.find((player: { id: string }) => player.id === "gk-1");
    const benchKeeper = payload.bench.find((player: { id: string }) => player.id === "gk-2");
    expect(lineupKeeper).toMatchObject({ punten: 8, roundPoints: 8, totalPoints: 52, advancementPoints: 5 });
    expect(benchKeeper).toMatchObject({ punten: 1, roundPoints: 1, totalPoints: 16, advancementPoints: 5 });
    expect(payload.teamCurrentRoundPoints).toBe(16);
    expect(payload.teamTotalPoints).toBe(60);
  });
});

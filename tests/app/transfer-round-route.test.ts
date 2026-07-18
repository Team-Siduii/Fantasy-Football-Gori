import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const isAuthenticatedSession = vi.fn(async () => true);
const getAuthenticatedEmail = vi.fn(async () => "alpha@gori.local");
const ensureAuthStateFromDb = vi.fn(async () => undefined);
const buildLeagueRankingSnapshot = vi.fn(async () => ({
  currentRound: 2,
  ranking: [
    {
      managerId: "alpha",
      displayName: "Alpha",
      teamName: "Alpha FC",
      email: "alpha@gori.local",
      subpoule: "A",
      position: 1,
    },
    {
      managerId: "beta",
      displayName: "Beta",
      teamName: "Beta FC",
      email: "beta@gori.local",
      subpoule: "A",
      position: 2,
    },
  ],
}));
const readTransferRoundPersistent = vi.fn(async () => ({
  roundNumber: 1,
  phase: "SELL",
  conflicts: [],
  updatedAt: "2026-06-18T10:00:00.000Z",
  entries: [
    {
      managerId: "alpha",
      email: "alpha@gori.local",
      displayName: "Alpha",
      teamName: "Alpha FC",
      subpoule: "A",
      rankingPosition: 1,
      sellStatus: "SUBMITTED",
      sellPlayerId: "sold-1",
      buyStatus: "PENDING",
      buyPlayerId: null,
      resolvedTransfer: null,
      updatedAt: "2026-06-18T10:01:00.000Z",
    },
    {
      managerId: "beta",
      email: "beta@gori.local",
      displayName: "Beta",
      teamName: "Beta FC",
      subpoule: "A",
      rankingPosition: 2,
      sellStatus: "PENDING",
      sellPlayerId: null,
      buyStatus: "LOCKED",
      buyPlayerId: null,
      resolvedTransfer: null,
      updatedAt: null,
    },
  ],
}));
const saveTransferRoundPersistent = vi.fn(async () => undefined);
const readManagerStatePersistent = vi.fn(async (_scope: string, email: string) => {
  if (email === "alpha@gori.local") {
    return { formation: "4-3-3", lineupIds: ["sold-1", "auto-1"], benchIds: [] };
  }
  return { formation: "4-3-3", lineupIds: ["beta-1"], benchIds: [] };
});
const readRosterPlayerIdsForManagerPersistent = vi.fn(async () => []);
const readManagerStateForRoundPersistent = vi.fn(async () => ({ formation: "4-3-3", lineupIds: [], benchIds: [] }));
const saveManagerStateForRoundPersistent = vi.fn(async () => undefined);
const removePlayerFromTeamRosterPersistent = vi.fn(async () => undefined);
const addPlayerToTeamRosterPersistent = vi.fn(async () => undefined);
const getInactivePlayer = vi.fn((playerId: string) => (playerId === "auto-1" ? { id: "auto-1", naam: "Auto Sell" } : null));
const isTeamEliminated = vi.fn(() => false);
const getWkMatches = vi.fn(async () => []);

vi.mock("@/lib/auth-session", () => ({
  isAuthenticatedSession,
  getAuthenticatedEmail,
}));
vi.mock("@/lib/auth-store", () => ({
  ensureAuthStateFromDb,
}));
vi.mock("@/domain/transfer-round", async () => await import("../../src/domain/transfer-round"));
vi.mock("@/domain/transfer-validation", () => ({
  validateTransferSquad: vi.fn(() => ({ valid: true, errors: [] })),
}));
vi.mock("@/lib/league-ranking", () => ({
  buildLeagueRankingSnapshot,
}));
vi.mock("@/lib/transfer-round-state", () => ({
  readTransferRoundPersistent,
  saveTransferRoundPersistent,
}));
vi.mock("@/lib/manager-state", () => ({
  readManagerStatePersistent,
  readManagerStateForRoundPersistent,
  saveManagerStateForRoundPersistent,
  isRoundLockedPersistent: vi.fn(async () => false),
}));
vi.mock("@/lib/draft-manager-sync", () => ({
  readRosterPlayerIdsForManagerPersistent,
}));
vi.mock("@/lib/team-roster-state", () => ({
  removePlayerFromTeamRosterPersistent,
  addPlayerToTeamRosterPersistent,
}));
vi.mock("@/lib/league-admin-config", () => ({
  getLeagueAdminConfigPersistent: vi.fn(async () => ({ budget: { teamValueCapMillions: 100 } })),
}));
vi.mock("@/domain/team-budget", () => ({
  getTransferBudgetCapMillions: () => 100,
}));
vi.mock("@/domain/player-csv", () => ({
  parsePlayerCsv: vi.fn(() => ({
    players: [
      { id: "sold-1", naam: "Sold One", positie: "DEF", club: "NED", prijs: 5, punten: 10, inactive: false },
      { id: "auto-1", naam: "Auto Sell", positie: "MID", club: "NED", prijs: 4, punten: 9, inactive: true },
      { id: "buy-1", naam: "Buy One", positie: "DEF", club: "ESP", prijs: 5, punten: 12, inactive: false },
    ],
  })),
}));
vi.mock("fs/promises", () => ({
  readFile: vi.fn(async () => "id,naam\n1,test"),
}));
vi.mock("@/lib/inactive-players", () => ({
  getInactivePlayer,
}));
vi.mock("@/lib/knockout-phase", () => ({
  isTeamEliminated,
}));
vi.mock("@/lib/wk-sync-store", () => ({
  getWkMatches,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/manager/transfer-round", () => {
  it("self-heals unfinished expired rounds before returning them", async () => {
    const { GET } = await import("../../src/app/api/manager/transfer-round/route");

    const response = await GET(new Request("http://localhost/api/manager/transfer-round?mode=wk&roundNumber=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(ensureAuthStateFromDb).toHaveBeenCalled();
    expect(saveTransferRoundPersistent).toHaveBeenCalled();
    expect(payload.state.phase).toBe("COMPLETED");
    expect(payload.pendingManagers).toEqual([]);
    expect(payload.state.entries.find((entry: any) => entry.managerId === "alpha")).toMatchObject({
      sellStatus: "SUBMITTED",
      buyStatus: "LOCKED",
      buyPlayerId: null,
    });
    expect(payload.state.entries.find((entry: any) => entry.managerId === "beta")).toMatchObject({
      sellStatus: "SKIPPED",
      buyStatus: "LOCKED",
    });
  });
});

describe("POST /api/manager/transfer-round", () => {
  it("accepts finalized queued sell ids and frees them from blocked transfer ids", async () => {
    readTransferRoundPersistent.mockResolvedValueOnce({
      roundNumber: 2,
      phase: "SELL",
      conflicts: [],
      updatedAt: "2026-06-18T10:00:00.000Z",
      entries: [
        {
          managerId: "alpha",
          email: "alpha@gori.local",
          displayName: "Alpha",
          teamName: "Alpha FC",
          subpoule: "A",
          rankingPosition: 1,
          sellStatus: "PENDING",
          sellPlayerId: null,
          buyStatus: "LOCKED",
          buyPlayerId: null,
          resolvedTransfer: null,
          updatedAt: null,
        },
        {
          managerId: "beta",
          email: "beta@gori.local",
          displayName: "Beta",
          teamName: "Beta FC",
          subpoule: "A",
          rankingPosition: 2,
          sellStatus: "PENDING",
          sellPlayerId: null,
          buyStatus: "LOCKED",
          buyPlayerId: null,
          resolvedTransfer: null,
          updatedAt: null,
        },
      ],
    });

    const { POST } = await import("../../src/app/api/manager/transfer-round/route");
    const response = await POST(
      new Request("http://localhost/api/manager/transfer-round?mode=wk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit-sell",
          roundNumber: 2,
          playerIds: ["sold-1", "auto-1"],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.currentEntry).toMatchObject({
      sellStatus: "SUBMITTED",
      sellPlayerId: "sold-1",
      autoSellPlayerIds: ["auto-1"],
      buyStatus: "PENDING",
    });
    expect(payload.blockedPlayerIds).not.toContain("sold-1");
    expect(payload.blockedPlayerIds).not.toContain("auto-1");
    expect(saveTransferRoundPersistent).toHaveBeenCalled();
  });
});

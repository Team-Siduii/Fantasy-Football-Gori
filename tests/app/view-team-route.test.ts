import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getAuthenticatedEmail = vi.fn(async () => "s.j.m.duindam@gmail.com");
const ensureAuthStateFromDb = vi.fn(async () => undefined);
const getProfileByEmail = vi.fn(() => ({ name: "Simon", teamName: "Simons Team" }));
const repairManagerTeamFromDraftArtifactsPersistent = vi.fn(async () => ({ changed: true }));
const buildManagerTeamViewPersistent = vi.fn(async () => ({
  roundNumber: 2,
  formation: "3-4-3",
  lineup: [{ id: "wk-player-1", punten: 0, roundPoints: 0, totalPoints: 42, advancementPoints: 5 }],
  bench: [{ id: "wk-player-2", punten: 5, roundPoints: 5, totalPoints: 12, advancementPoints: 5 }],
  budgetCap: 100,
  budgetRemaining: 90,
  squadCost: 10,
  pendingSellId: "wk-player-2",
  pendingBuyId: "wk-player-3",
  teamTotalPoints: 42,
  teamCurrentRoundPoints: 12,
  scoreSource: "team-score-state",
  hasPersistedPlayers: true,
}));

vi.mock("@/lib/auth-session", () => ({
  getAuthenticatedEmail,
}));

vi.mock("@/lib/auth-store", () => ({
  ensureAuthStateFromDb,
  getProfileByEmail,
}));

vi.mock("@/lib/draft-manager-sync", () => ({
  repairManagerTeamFromDraftArtifactsPersistent,
}));

vi.mock("@/lib/manager-team-view", () => ({
  buildManagerTeamViewPersistent,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/manager/view-team", () => {
  it("repairs the target manager team and returns the shared server-side read-model", async () => {
    const { GET } = await import("../../src/app/api/manager/view-team/route");

    const response = await GET(
      new Request("http://localhost/api/manager/view-team?mode=wk&email=s.j.m.duindam@gmail.com&roundNumber=2"),
    );
    const payload = await response.json();

    expect(repairManagerTeamFromDraftArtifactsPersistent).toHaveBeenCalledWith({
      managerEmail: "s.j.m.duindam@gmail.com",
      scope: "wk",
    });
    expect(buildManagerTeamViewPersistent).toHaveBeenCalledWith({
      scope: "wk",
      managerEmail: "s.j.m.duindam@gmail.com",
      roundNumber: 2,
    });
    expect(payload).toMatchObject({
      isOwnTeam: true,
      teamName: "Simons Team",
      managerName: "Simon",
      formation: "3-4-3",
      pendingSellId: "wk-player-2",
      pendingBuyId: "wk-player-3",
      teamTotalPoints: 42,
      teamCurrentRoundPoints: 12,
    });
    expect(payload.bench[0].punten).toBe(3);
    expect(payload.lineup[0].advancementPoints).toBe(5);
    expect(payload.bench[0].advancementPoints).toBe(5);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getAuthenticatedEmail = vi.fn(async () => "emielzomerdijk@gmail.com");
const ensureAuthStateFromDb = vi.fn(async () => undefined);
const getProfileByEmail = vi.fn(() => ({ name: "Emiel", teamName: "FC Emiel" }));
const repairManagerTeamFromDraftArtifactsPersistent = vi.fn(async () => ({ changed: true }));
const buildManagerTeamViewPersistent = vi.fn(async () => ({
  roundNumber: 2,
  formation: "3-4-3",
  lineup: [{ id: "a" }],
  bench: [{ id: "b" }],
  budgetCap: 100,
  budgetRemaining: 12,
  squadCost: 88,
  pendingSellId: "b",
  pendingBuyId: "c",
  teamTotalPoints: 44,
  teamCurrentRoundPoints: 9,
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

describe("GET /api/manager/my-team-view", () => {
  it("repairs the authenticated manager state and returns the server-side team read-model", async () => {
    const { GET } = await import("../../src/app/api/manager/my-team-view/route");

    const response = await GET(new Request("http://localhost/api/manager/my-team-view?mode=wk&roundNumber=2"));
    const payload = await response.json();

    expect(repairManagerTeamFromDraftArtifactsPersistent).toHaveBeenCalledWith({
      managerEmail: "emielzomerdijk@gmail.com",
      scope: "wk",
    });
    expect(buildManagerTeamViewPersistent).toHaveBeenCalledWith({
      scope: "wk",
      managerEmail: "emielzomerdijk@gmail.com",
      roundNumber: 2,
    });
    expect(payload).toMatchObject({
      isOwnTeam: true,
      teamName: "FC Emiel",
      managerName: "Emiel",
      formation: "3-4-3",
      pendingSellId: "b",
      pendingBuyId: "c",
      hasPersistedPlayers: true,
    });
  });
});

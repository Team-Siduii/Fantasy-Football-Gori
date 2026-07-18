import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const readManagerStateForRoundPersistent = vi.fn(async () => ({
  formation: "3-4-3",
  lineupIds: ["a"],
  benchIds: ["b"],
}));
const readManagerStatePersistent = vi.fn(async () => ({
  formation: "3-4-3",
  lineupIds: ["a"],
  benchIds: ["b"],
}));
const saveManagerStateForRoundPersistent = vi.fn();
const saveManagerStatePersistent = vi.fn();
const getAuthenticatedEmail = vi.fn(async () => "emielzomerdijk@gmail.com");
const isAuthenticatedSession = vi.fn(async () => true);
const ensureAuthStateFromDb = vi.fn(async () => undefined);
const repairManagerTeamFromDraftArtifactsPersistent = vi.fn(async () => ({ changed: true }));

vi.mock("@/lib/manager-state", () => ({
  readManagerStateForRoundPersistent,
  readManagerStatePersistent,
  saveManagerStateForRoundPersistent,
  saveManagerStatePersistent,
}));

vi.mock("@/lib/auth-session", () => ({
  getAuthenticatedEmail,
  isAuthenticatedSession,
}));

vi.mock("@/lib/auth-store", () => ({
  ensureAuthStateFromDb,
}));

vi.mock("@/lib/draft-manager-sync", () => ({
  repairManagerTeamFromDraftArtifactsPersistent,
}));

vi.mock("@/lib/world-cup-schedule", () => ({
  isRoundActive: vi.fn(() => false),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/manager/state", () => {
  it("repairs WK manager state before reading round snapshots", async () => {
    const { GET } = await import("../../src/app/api/manager/state/route");

    const response = await GET(new Request("http://localhost/api/manager/state?mode=wk&roundNumber=2"));
    const payload = await response.json();

    expect(repairManagerTeamFromDraftArtifactsPersistent).toHaveBeenCalledWith({
      managerEmail: "emielzomerdijk@gmail.com",
      scope: "wk",
    });
    expect(readManagerStateForRoundPersistent).toHaveBeenCalledWith(2, "wk", "emielzomerdijk@gmail.com");
    expect(payload.state.formation).toBe("3-4-3");
  });
});

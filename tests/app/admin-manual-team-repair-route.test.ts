import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const isAuthenticatedSession = vi.fn(async () => true);
const getAuthenticatedEmail = vi.fn(async () => "admin@gori.local");
const ensureAuthStateFromDb = vi.fn(async () => undefined);
const isAdminEmail = vi.fn((email: string) => email === "admin@gori.local");
const resolveCanonicalManagerId = vi.fn((scope: string, managerKey: string) => {
  if (scope === "wk" && managerKey === "ice.eckmund@gmail.com") return "ice-eckmund";
  return managerKey;
});
const readManagerStatePersistent = vi.fn(async () => ({
  formation: "4-3-3",
  lineupIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"],
  benchIds: ["p12", "p13", "p14"],
}));
const saveManagerStatePersistent = vi.fn(async () => undefined);
const saveManagerStateForRoundPersistent = vi.fn(async () => undefined);
const setTeamRosterForManagerPersistent = vi.fn(async (_teamId: string, playerIds: string[]) => ({
  byTeamId: {
    "ice-eckmund": playerIds,
    "thomas-bart": ["old-thomas"],
  },
}));
const readTransferRoundPersistent = vi.fn(async () => ({
  roundNumber: 6,
  phase: "SELL",
  conflicts: [],
  updatedAt: "2026-07-11T12:00:00.000Z",
  entries: [
    {
      managerId: "ice-eckmund",
      email: "ice.eckmund@gmail.com",
      displayName: "Ice",
      teamName: "Ice Palace FC",
      subpoule: "A",
      rankingPosition: 1,
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
const readFile = vi.fn(async () => "id,positie\np1,GK\np2,DEF\np3,DEF\np4,DEF\np5,DEF\np6,MID\np7,MID\np8,MID\np9,FWD\np10,FWD\np11,FWD\np12,GK\np13,DEF\np14,MID\n");
const parsePlayerCsv = vi.fn(() => ({
  players: [
    { id: "p1", positie: "GK" },
    { id: "p2", positie: "DEF" },
    { id: "p3", positie: "DEF" },
    { id: "p4", positie: "DEF" },
    { id: "p5", positie: "DEF" },
    { id: "p6", positie: "MID" },
    { id: "p7", positie: "MID" },
    { id: "p8", positie: "MID" },
    { id: "p9", positie: "FWD" },
    { id: "p10", positie: "FWD" },
    { id: "p11", positie: "FWD" },
    { id: "p12", positie: "GK" },
    { id: "p13", positie: "DEF" },
    { id: "p14", positie: "MID" },
  ],
}));

vi.mock("fs/promises", () => ({ readFile }));
vi.mock("@/domain/player-csv", () => ({ parsePlayerCsv }));
vi.mock("@/domain/formation", () => ({
  buildFormationSlots: vi.fn(() => [["GK"], ["DEF", "DEF", "DEF", "DEF"], ["MID", "MID", "MID"], ["FWD", "FWD", "FWD"]]),
  getFormationOptions: vi.fn(() => ["4-3-3"]),
}));
vi.mock("@/lib/auth-session", () => ({ isAuthenticatedSession, getAuthenticatedEmail }));
vi.mock("@/lib/auth-store", () => ({ ensureAuthStateFromDb, isAdminEmail }));
vi.mock("@/lib/manager-state", () => ({
  readManagerStatePersistent,
  saveManagerStatePersistent,
  saveManagerStateForRoundPersistent,
}));
vi.mock("@/lib/manager-identity", () => ({ resolveCanonicalManagerId }));
vi.mock("@/lib/team-roster-state", () => ({ setTeamRosterForManagerPersistent }));
vi.mock("@/lib/transfer-round-state", () => ({ readTransferRoundPersistent, saveTransferRoundPersistent }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/manual-team-repair", () => {
  it("writes the repaired roster under the canonical managerId instead of a drifting alias", async () => {
    const { POST } = await import("../../src/app/api/admin/manual-team-repair/route");

    const response = await POST(
      new Request("http://localhost/api/admin/manual-team-repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "wk",
          managerEmail: "ice.eckmund@gmail.com",
          roundNumber: 6,
          lineupIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"],
          benchIds: ["p12", "p13", "p14"],
          formation: "4-3-3",
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(resolveCanonicalManagerId).toHaveBeenCalledWith("wk", "ice.eckmund@gmail.com");
    expect(setTeamRosterForManagerPersistent).toHaveBeenCalledWith(
      "ice-eckmund",
      ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12", "p13", "p14"],
      "wk",
    );
    expect(payload.rosterKey).toBe("ice-eckmund");
  });
});

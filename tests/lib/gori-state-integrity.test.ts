import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { beforeEach, describe, expect, it } from "vitest";

const root = "/tmp/ffg-integrity-tests";
const managerPath = `${root}/manager-state.json`;
const managerWkPath = `${root}/manager-state-wk.json`;
const authPath = `${root}/auth-state.json`;
const leaguePath = `${root}/league-admin-config.json`;
const leagueWkPath = `${root}/league-admin-config-wk.json`;

async function loadModules() {
  const integrity = await import("../../src/lib/gori-state-integrity");
  const managerState = await import("../../src/lib/manager-state");
  return { integrity, managerState };
}

describe("gori state integrity", () => {
  beforeEach(() => {
    process.env.MANAGER_STATE_PATH = managerPath;
    process.env.MANAGER_STATE_WK_PATH = managerWkPath;
    process.env.AUTH_STATE_PATH = authPath;
    process.env.LEAGUE_ADMIN_CONFIG_PATH = leaguePath;
    process.env.LEAGUE_ADMIN_CONFIG_WK_PATH = leagueWkPath;

    mkdirSync(dirname(managerPath), { recursive: true });

    writeFileSync(
      authPath,
      JSON.stringify(
        {
          accounts: [
            {
              id: "thomas-bart",
              role: "manager",
              profile: {
                name: "Thomas",
                email: "thomas-old@example.com",
                teamName: "FC Thomas",
              },
              passwordHash: "hash",
              passwordSalt: "salt",
              mustSetup: false,
            },
          ],
          resetTokens: [],
        },
        null,
        2,
      ),
      "utf-8",
    );

    writeFileSync(
      leaguePath,
      JSON.stringify(
        {
          competition: { name: "Eredivisie", cupTiePolicy: "PENALTIES", formats: ["LEAGUE_TABLE"] },
          draft: { totalRounds: 15, mode: "admin" },
          scoringProfile: { id: "classic", type: "CLASSIC", label: "Classic" },
          waiver: { enabled: true, round: { tieBreaker: "PRIORITY", roundNumber: 5, status: "OPEN", openedAt: "x", revealAt: "y" } },
          budget: { teamValueCapMillions: 32 },
          roles: { ownerId: "owner-1", commissionerIds: [], managerIds: ["thomas-bart", "jack-van-der-reep"] },
          participants: [
            { managerId: "thomas-bart", label: "Thomas", email: "Thomasbart91@gmail.com", status: "ACCEPTED" },
            { managerId: "jack-van-der-reep", label: "Jack", email: "Jackvandereep@hotmail.com", status: "ACCEPTED" },
          ],
          customRuleNotes: [],
        },
        null,
        2,
      ),
      "utf-8",
    );

    writeFileSync(
      leagueWkPath,
      JSON.stringify(
        {
          competition: { name: "WK 2026", cupTiePolicy: "PENALTIES", formats: ["LEAGUE_TABLE"] },
          draft: { totalRounds: 15, mode: "admin" },
          scoringProfile: { id: "classic", type: "CLASSIC", label: "Classic" },
          waiver: { enabled: true, round: { tieBreaker: "PRIORITY", roundNumber: 5, status: "OPEN", openedAt: "x", revealAt: "y" } },
          budget: { teamValueCapMillions: 100 },
          roles: { ownerId: "owner-1", commissionerIds: [], managerIds: [] },
          participants: [],
          customRuleNotes: [],
        },
        null,
        2,
      ),
      "utf-8",
    );

    writeFileSync(
      managerPath,
      JSON.stringify(
        {
          formation: "4-3-3",
          lineupIds: [],
          benchIds: [],
          pickedTransferId: null,
          pendingSellId: null,
          pendingBuyId: null,
          roundStates: {},
          managerStates: {
            "thomas-old@example.com": {
              formation: "4-3-3",
              lineupIds: ["p1", "p2"],
              benchIds: ["p3"],
              pickedTransferId: null,
              pendingSellId: null,
              pendingBuyId: null,
              roundStates: {
                "1": {
                  formation: "4-3-3",
                  lineupIds: ["p1", "p2"],
                  benchIds: ["p3"],
                  pickedTransferId: null,
                  pendingSellId: null,
                  pendingBuyId: null,
                },
              },
            },
          },
          roundLocks: [],
          adminActionLog: [],
        },
        null,
        2,
      ),
      "utf-8",
    );

    writeFileSync(
      managerWkPath,
      JSON.stringify({
        formation: "4-3-3",
        lineupIds: [],
        benchIds: [],
        pickedTransferId: null,
        pendingSellId: null,
        pendingBuyId: null,
        roundStates: {},
        managerStates: {},
        roundLocks: [],
        adminActionLog: [],
      }, null, 2),
      "utf-8",
    );
  });

  it("reports auth, participant and legacy manager-state mismatches", async () => {
    const { integrity } = await loadModules();

    const report = await integrity.getIntegrityReport("eredivisie");

    expect(report.summary.totalIssues).toBeGreaterThanOrEqual(3);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "participant_auth_email_mismatch", managerId: "thomas-bart" }),
        expect.objectContaining({ type: "legacy_manager_state_key", managerId: "thomas-bart", key: "thomas-old@example.com" }),
        expect.objectContaining({ type: "participant_missing_auth_account", managerId: "sim-duindam" }),
        expect.objectContaining({ type: "participant_missing_auth_account", managerId: "admin" }),
      ]),
    );
  });

  it("repairs legacy manager-state keys into canonical managerIds", async () => {
    const { integrity, managerState } = await loadModules();

    const result = await integrity.repairIntegrityIssues("eredivisie");

    expect(result.updated).toBe(true);
    expect(result.repairedManagerStateKeys).toBe(1);

    const repairedState = await managerState.readManagerStatePersistent("eredivisie", "thomas-bart");
    expect(repairedState.lineupIds).toEqual(["p1", "p2"]);
    expect(repairedState.benchIds).toEqual(["p3"]);

    const reportAfter = await integrity.getIntegrityReport("eredivisie");
    expect(reportAfter.issues.some((issue: { type: string }) => issue.type === "legacy_manager_state_key")).toBe(false);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, unlinkSync, writeFileSync, readFileSync } from "fs";
import path from "path";

const root = "/tmp/ffg-manager-state-canonical-tests";
const managerWkPath = `${root}/manager-state-wk.json`;
const leagueWkPath = `${root}/league-admin-config-wk.json`;
const authPath = `${root}/auth-state.json`;

async function loadModules() {
  const managerState = await import("../../src/lib/manager-state");
  const auth = await import("../../src/lib/auth-store");
  return { managerState, auth };
}

afterEach(async () => {
  process.env.MANAGER_STATE_WK_PATH = managerWkPath;
  process.env.LEAGUE_ADMIN_CONFIG_WK_PATH = leagueWkPath;
  process.env.AUTH_STATE_PATH = authPath;

  for (const target of [managerWkPath, leagueWkPath, authPath]) {
    if (existsSync(target)) {
      unlinkSync(target);
    }
  }

  try {
    const auth = await import("../../src/lib/auth-store");
    auth.resetAuthStateForTests();
  } catch {
    // ignore teardown reload issues
  }

  delete process.env.MANAGER_STATE_WK_PATH;
  delete process.env.LEAGUE_ADMIN_CONFIG_WK_PATH;
  delete process.env.AUTH_STATE_PATH;
});

describe("manager-state canonical resolution", () => {
  it("prefers WK participant managerId over conflicting preset id when saving by email", async () => {
    mkdirSync(root, { recursive: true });
    process.env.MANAGER_STATE_WK_PATH = managerWkPath;
    process.env.LEAGUE_ADMIN_CONFIG_WK_PATH = leagueWkPath;
    process.env.AUTH_STATE_PATH = authPath;

    writeFileSync(
      leagueWkPath,
      JSON.stringify(
        {
          participants: [
            {
              managerId: "johan201",
              label: "Johan Swart",
              email: "Johan201@hotmail.com",
              status: "ACCEPTED",
            },
          ],
        },
        null,
        2,
      ),
      "utf-8",
    );

    writeFileSync(
      authPath,
      JSON.stringify(
        {
          accounts: [],
        },
        null,
        2,
      ),
      "utf-8",
    );

    const { managerState, auth } = await loadModules();
    auth.resetAuthStateForTests();

    await managerState.saveManagerStatePersistent(
      {
        formation: "4-3-3",
        lineupIds: ["sold-1", "stay-1"],
        benchIds: ["bench-1"],
      },
      "wk",
      "Johan201@hotmail.com",
    );

    const persisted = JSON.parse(readFileSync(managerWkPath, "utf-8"));
    expect(Object.keys(persisted.managerStates ?? {})).toContain("johan201");
    expect(Object.keys(persisted.managerStates ?? {})).not.toContain("johan-swart");

    const canonical = await managerState.readManagerStatePersistent("wk", "johan201");
    expect(canonical.lineupIds).toContain("sold-1");
  });
});

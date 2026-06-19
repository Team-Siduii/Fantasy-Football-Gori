import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, unlinkSync } from "fs";

const root = "/tmp/ffg-manager-team-state-source-tests";
const managerWkPath = `${root}/manager-state-wk.json`;
const leagueWkPath = `${root}/league-admin-config-wk.json`;
const authPath = `${root}/auth-state.json`;

async function loadModules() {
  const managerState = await import("../../src/lib/manager-state");
  const teamSource = await import("../../src/lib/manager-team-state-source");
  const auth = await import("../../src/lib/auth-store");
  return { managerState, teamSource, auth };
}

afterEach(async () => {
  process.env.GORI_DISABLE_DATABASE = "1";
  process.env.MANAGER_STATE_WK_PATH = managerWkPath;
  process.env.LEAGUE_ADMIN_CONFIG_WK_PATH = leagueWkPath;
  process.env.AUTH_STATE_PATH = authPath;

  for (const target of [managerWkPath, leagueWkPath, authPath]) {
    if (existsSync(target)) {
      unlinkSync(target);
    }
  }

  try {
    const managerState = await import("../../src/lib/manager-state");
    managerState.resetManagerStateForTests("wk");
    const persistent = await import("../../src/lib/persistent-json-store");
    persistent.resetPersistentJsonStoreForTests();
    const auth = await import("../../src/lib/auth-store");
    auth.resetAuthStateForTests();
  } catch {
    // ignore teardown reload issues
  }

  delete process.env.MANAGER_STATE_WK_PATH;
  delete process.env.LEAGUE_ADMIN_CONFIG_WK_PATH;
  delete process.env.AUTH_STATE_PATH;
  delete process.env.GORI_DISABLE_DATABASE;
});

describe("manager team state source", () => {
  it("prefers the requested WK round snapshot over the top-level team state", async () => {
    mkdirSync(root, { recursive: true });
    process.env.GORI_DISABLE_DATABASE = "1";
    process.env.MANAGER_STATE_WK_PATH = managerWkPath;
    process.env.LEAGUE_ADMIN_CONFIG_WK_PATH = leagueWkPath;
    process.env.AUTH_STATE_PATH = authPath;

    const { managerState, teamSource, auth } = await loadModules();
    managerState.resetManagerStateForTests("wk");
    auth.resetAuthStateForTests();

    await managerState.saveManagerStatePersistent(
      {
        formation: "4-3-3",
        lineupIds: ["top-1", "top-2"],
        benchIds: ["top-bench"],
      },
      "wk",
      "ice.eckmund@gmail.com",
    );

    await managerState.saveManagerStateForRoundPersistent(
      2,
      {
        formation: "3-4-3",
        lineupIds: ["round-1", "round-2"],
        benchIds: ["round-bench"],
      },
      "wk",
      true,
      "ice.eckmund@gmail.com",
    );

    const snapshot = await teamSource.readTeamViewSnapshotPersistent({
      scope: "wk",
      managerEmail: "ice.eckmund@gmail.com",
      roundNumber: 2,
    });

    expect(snapshot.formation).toBe("3-4-3");
    expect(snapshot.lineupIds).toEqual(["round-1", "round-2"]);
    expect(snapshot.benchIds).toEqual(["round-bench"]);
  });

  it("falls back to the top-level team state when no WK round is requested", async () => {
    mkdirSync(root, { recursive: true });
    process.env.GORI_DISABLE_DATABASE = "1";
    process.env.MANAGER_STATE_WK_PATH = managerWkPath;
    process.env.LEAGUE_ADMIN_CONFIG_WK_PATH = leagueWkPath;
    process.env.AUTH_STATE_PATH = authPath;

    const { managerState, teamSource, auth } = await loadModules();
    managerState.resetManagerStateForTests("wk");
    auth.resetAuthStateForTests();

    await managerState.saveManagerStatePersistent(
      {
        formation: "4-3-3",
        lineupIds: ["top-1", "top-2"],
        benchIds: ["top-bench"],
      },
      "wk",
      "emielzomerdijk@gmail.com",
    );
    const snapshot = await teamSource.readTeamViewSnapshotPersistent({
      scope: "wk",
      managerEmail: "emielzomerdijk@gmail.com",
    });

    expect(snapshot.formation).toBe("4-3-3");
    expect(snapshot.lineupIds).toEqual(["top-1", "top-2"]);
    expect(snapshot.benchIds).toEqual(["top-bench"]);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, unlinkSync, existsSync } from "fs";
import path from "path";

const root = "/tmp/ffg-league-ranking-tests";
const managerPath = `${root}/manager-state.json`;
const managerWkPath = `${root}/manager-state-wk.json`;
const authPath = `${root}/auth-state.json`;
const leaguePath = `${root}/league-admin-config.json`;
const leagueWkPath = `${root}/league-admin-config-wk.json`;

async function loadModules() {
  const auth = await import("../../src/lib/auth-store");
  const ranking = await import("../../src/lib/league-ranking");
  return { auth, ranking };
}

afterEach(async () => {
  process.env.MANAGER_STATE_PATH = managerPath;
  process.env.MANAGER_STATE_WK_PATH = managerWkPath;
  process.env.AUTH_STATE_PATH = authPath;
  process.env.LEAGUE_ADMIN_CONFIG_PATH = leaguePath;
  process.env.LEAGUE_ADMIN_CONFIG_WK_PATH = leagueWkPath;

  for (const target of [managerPath, managerWkPath, authPath, leaguePath, leagueWkPath]) {
    if (existsSync(target)) {
      unlinkSync(target);
    }
  }

  try {
    const auth = await import("../../src/lib/auth-store");
    auth.resetAuthStateForTests();
  } catch {
    // ignore cleanup reload issues during teardown
  }

  delete process.env.MANAGER_STATE_PATH;
  delete process.env.MANAGER_STATE_WK_PATH;
  delete process.env.AUTH_STATE_PATH;
  delete process.env.LEAGUE_ADMIN_CONFIG_PATH;
  delete process.env.LEAGUE_ADMIN_CONFIG_WK_PATH;
});

describe("league ranking snapshot", () => {
  it("includes Simon in WK competitie even though his auth account is admin", async () => {
    mkdirSync(path.dirname(managerPath), { recursive: true });
    process.env.MANAGER_STATE_PATH = managerPath;
    process.env.MANAGER_STATE_WK_PATH = managerWkPath;
    process.env.AUTH_STATE_PATH = authPath;
    process.env.LEAGUE_ADMIN_CONFIG_PATH = leaguePath;
    process.env.LEAGUE_ADMIN_CONFIG_WK_PATH = leagueWkPath;

    const { auth, ranking } = await loadModules();
    auth.resetAuthStateForTests();

    const snapshot = await ranking.buildLeagueRankingSnapshot("wk", "s.j.m.duindam@gmail.com");

    expect(snapshot.allRanking.map((entry) => entry.email)).toContain("s.j.m.duindam@gmail.com");
    expect(snapshot.ranking.map((entry) => entry.email)).toContain("s.j.m.duindam@gmail.com");
    expect(snapshot.allRanking.map((entry) => entry.email)).not.toContain("admin@gori.local");
  });
});

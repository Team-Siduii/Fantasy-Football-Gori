import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, unlinkSync, existsSync } from "fs";
import path from "path";

vi.mock("server-only", () => ({}));

const root = "/tmp/ffg-league-ranking-tests";
const managerPath = `${root}/manager-state.json`;
const managerWkPath = `${root}/manager-state-wk.json`;
const authPath = `${root}/auth-state.json`;
const leaguePath = `${root}/league-admin-config.json`;
const leagueWkPath = `${root}/league-admin-config-wk.json`;
const teamScoreWkPath = `${root}/team-score-state-wk.json`;

async function loadModules() {
  const auth = await import("../../src/lib/auth-store");
  const leagueRanking = await import("../../src/lib/league-ranking");
  const teamScoreState = await import("../../src/lib/team-score-state");
  return { auth, leagueRanking, teamScoreState };
}

afterEach(async () => {
  process.env.MANAGER_STATE_PATH = managerPath;
  process.env.MANAGER_STATE_WK_PATH = managerWkPath;
  process.env.AUTH_STATE_PATH = authPath;
  process.env.LEAGUE_ADMIN_CONFIG_PATH = leaguePath;
  process.env.LEAGUE_ADMIN_CONFIG_WK_PATH = leagueWkPath;
  process.env.TEAM_SCORE_STATE_WK_PATH = teamScoreWkPath;

  for (const target of [managerPath, managerWkPath, authPath, leaguePath, leagueWkPath, teamScoreWkPath]) {
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
  delete process.env.TEAM_SCORE_STATE_WK_PATH;
});

describe("league ranking snapshot", () => {
  it("includes Simon in WK competitie even though his auth account is admin", async () => {
    mkdirSync(path.dirname(managerPath), { recursive: true });
    process.env.MANAGER_STATE_PATH = managerPath;
    process.env.MANAGER_STATE_WK_PATH = managerWkPath;
    process.env.AUTH_STATE_PATH = authPath;
    process.env.LEAGUE_ADMIN_CONFIG_PATH = leaguePath;
    process.env.LEAGUE_ADMIN_CONFIG_WK_PATH = leagueWkPath;
    process.env.TEAM_SCORE_STATE_WK_PATH = teamScoreWkPath;

    const { auth, leagueRanking, teamScoreState } = await loadModules();
    auth.resetAuthStateForTests();
    teamScoreState.resetTeamScoreStateForTests("wk");
    await teamScoreState.saveManagerRoundScoreSnapshotPersistent("wk", "s.j.m.duindam@gmail.com", {
      roundNumber: 1,
      lineupIds: ["1"],
      benchIds: ["2"],
      lineupPoints: 9,
      benchPoints: 2,
      totalPoints: 11,
      calculatedAt: "2026-06-15T12:00:00.000Z",
      source: "wk-events-v1",
    });

    const snapshot = await leagueRanking.buildLeagueRankingSnapshot("wk", "s.j.m.duindam@gmail.com");

    expect(snapshot.allRanking.map((entry: { email: string }) => entry.email)).toContain("s.j.m.duindam@gmail.com");
    expect(snapshot.ranking.map((entry: { email: string }) => entry.email)).toContain("s.j.m.duindam@gmail.com");
    expect(snapshot.allRanking.map((entry: { email: string }) => entry.email)).not.toContain("admin@gori.local");
    expect(snapshot.allRanking.find((entry: { email: string; totalPoints: number }) => entry.email === "s.j.m.duindam@gmail.com")?.totalPoints).toBe(11);
  }, 15000);

  it("returns historical round totals and round points for a selected WK round", async () => {
    mkdirSync(path.dirname(managerPath), { recursive: true });
    process.env.MANAGER_STATE_PATH = managerPath;
    process.env.MANAGER_STATE_WK_PATH = managerWkPath;
    process.env.AUTH_STATE_PATH = authPath;
    process.env.LEAGUE_ADMIN_CONFIG_PATH = leaguePath;
    process.env.LEAGUE_ADMIN_CONFIG_WK_PATH = leagueWkPath;
    process.env.TEAM_SCORE_STATE_WK_PATH = teamScoreWkPath;

    const { auth, leagueRanking, teamScoreState } = await loadModules();
    auth.resetAuthStateForTests();
    teamScoreState.resetTeamScoreStateForTests("wk");

    await teamScoreState.saveManagerRoundScoreSnapshotPersistent("wk", "emielzomerdijk@gmail.com", {
      roundNumber: 6,
      lineupIds: ["1"],
      benchIds: ["2"],
      lineupPoints: 6,
      benchPoints: 1,
      totalPoints: 7,
      calculatedAt: "2026-07-12T12:00:00.000Z",
      source: "wk-events-v1",
    });
    await teamScoreState.saveManagerRoundScoreSnapshotPersistent("wk", "emielzomerdijk@gmail.com", {
      roundNumber: 7,
      lineupIds: ["1"],
      benchIds: ["2"],
      lineupPoints: 10,
      benchPoints: 2,
      totalPoints: 12,
      calculatedAt: "2026-07-15T12:00:00.000Z",
      source: "wk-events-v1",
    });

    const round7Snapshot = await leagueRanking.buildLeagueRankingSnapshot("wk", "emielzomerdijk@gmail.com", 7);
    const round8Snapshot = await leagueRanking.buildLeagueRankingSnapshot("wk", "emielzomerdijk@gmail.com", 8);
    const emielRound7 = round7Snapshot.allRanking.find((entry: { email: string }) => entry.email === "emielzomerdijk@gmail.com");
    const emielRound8 = round8Snapshot.allRanking.find((entry: { email: string }) => entry.email === "emielzomerdijk@gmail.com");

    expect(round7Snapshot.selectedRound).toBe(7);
    expect(emielRound7).toMatchObject({
      currentRoundPoints: 12,
      totalPoints: 19,
    });
    expect(round8Snapshot.selectedRound).toBe(8);
    expect(emielRound8).toMatchObject({
      currentRoundPoints: 12,
      totalPoints: 19,
    });
  }, 15000);
});

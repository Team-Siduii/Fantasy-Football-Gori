import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { isGoriDatabaseEnabled, readPersistentJson, writePersistentJson } from "./persistent-json-store";

export type TeamScoreScope = "eredivisie" | "wk";

export type TeamScoreRoundSnapshot = {
  roundNumber: number;
  lineupIds: string[];
  benchIds: string[];
  lineupPoints: number;
  benchPoints: number;
  totalPoints: number;
  calculatedAt: string;
  source: string;
};

export type ManagerTeamScoreState = {
  rounds: Record<string, TeamScoreRoundSnapshot>;
};

export type TeamScoreState = {
  byManagerKey: Record<string, ManagerTeamScoreState>;
};

const DEFAULT_STATE: TeamScoreState = {
  byManagerKey: {},
};

function normalizeManagerKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeRoundSnapshot(input: TeamScoreRoundSnapshot): TeamScoreRoundSnapshot {
  return {
    roundNumber: input.roundNumber,
    lineupIds: Array.isArray(input.lineupIds) ? input.lineupIds.filter((id): id is string => typeof id === "string") : [],
    benchIds: Array.isArray(input.benchIds) ? input.benchIds.filter((id): id is string => typeof id === "string") : [],
    lineupPoints: Number(input.lineupPoints ?? 0),
    benchPoints: Number(input.benchPoints ?? 0),
    totalPoints: Number(input.totalPoints ?? 0),
    calculatedAt: typeof input.calculatedAt === "string" && input.calculatedAt ? input.calculatedAt : new Date(0).toISOString(),
    source: typeof input.source === "string" && input.source ? input.source : "unknown",
  };
}

function normalizeState(input: Partial<TeamScoreState> | null | undefined): TeamScoreState {
  const byManagerKey: Record<string, ManagerTeamScoreState> = {};
  for (const [rawKey, rawManagerState] of Object.entries(input?.byManagerKey ?? {})) {
    const managerKey = normalizeManagerKey(rawKey);
    if (!managerKey) {
      continue;
    }

    const normalizedRounds: Record<string, TeamScoreRoundSnapshot> = {};
    for (const [roundKey, snapshot] of Object.entries(rawManagerState?.rounds ?? {})) {
      if (!snapshot || typeof snapshot !== "object") {
        continue;
      }
      normalizedRounds[roundKey] = normalizeRoundSnapshot(snapshot as TeamScoreRoundSnapshot);
    }

    byManagerKey[managerKey] = { rounds: normalizedRounds };
  }

  return { byManagerKey };
}

export function resolveTeamScoreStatePath(scope: TeamScoreScope = "eredivisie") {
  if (scope === "wk" && process.env.TEAM_SCORE_STATE_WK_PATH) {
    return process.env.TEAM_SCORE_STATE_WK_PATH;
  }
  if (scope === "eredivisie" && process.env.TEAM_SCORE_STATE_PATH) {
    return process.env.TEAM_SCORE_STATE_PATH;
  }
  if (process.env.VERCEL) {
    return scope === "wk" ? "/tmp/team-score-state-wk.json" : "/tmp/team-score-state.json";
  }
  return path.join(process.cwd(), "data", scope === "wk" ? "team-score-state-wk.json" : "team-score-state.json");
}

export function readTeamScoreState(scope: TeamScoreScope = "eredivisie"): TeamScoreState {
  const target = resolveTeamScoreStatePath(scope);
  if (!existsSync(target)) {
    return { ...DEFAULT_STATE };
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as Partial<TeamScoreState>;
    return normalizeState(parsed);
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveTeamScoreState(next: TeamScoreState, scope: TeamScoreScope = "eredivisie"): TeamScoreState {
  const normalized = normalizeState(next);
  const target = resolveTeamScoreStatePath(scope);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
}

async function writeTeamScoreStatePersistent(next: TeamScoreState, scope: TeamScoreScope = "eredivisie") {
  const normalized = saveTeamScoreState(next, scope);
  if (isGoriDatabaseEnabled()) {
    await writePersistentJson({ store: "team-score-state", scope }, normalized);
  }
  return normalized;
}

export async function readTeamScoreStatePersistent(scope: TeamScoreScope = "eredivisie"): Promise<TeamScoreState> {
  const fallback = readTeamScoreState(scope);
  if (!isGoriDatabaseEnabled()) {
    return fallback;
  }
  const persisted = await readPersistentJson({ store: "team-score-state", scope }, fallback);
  return saveTeamScoreState(normalizeState(persisted), scope);
}

export async function saveManagerRoundScoreSnapshotPersistent(
  scope: TeamScoreScope,
  managerKey: string,
  snapshot: TeamScoreRoundSnapshot,
): Promise<TeamScoreRoundSnapshot> {
  const normalizedManagerKey = normalizeManagerKey(managerKey);
  if (!normalizedManagerKey) {
    throw new Error("managerKey is verplicht");
  }

  const state = await readTeamScoreStatePersistent(scope);
  const next = normalizeState(state);
  const managerState = next.byManagerKey[normalizedManagerKey] ?? { rounds: {} };
  managerState.rounds[String(snapshot.roundNumber)] = normalizeRoundSnapshot(snapshot);
  next.byManagerKey[normalizedManagerKey] = managerState;
  await writeTeamScoreStatePersistent(next, scope);
  return managerState.rounds[String(snapshot.roundNumber)];
}

export function getManagerRoundScore(
  state: TeamScoreState,
  managerKey: string,
  roundNumber: number,
): TeamScoreRoundSnapshot | null {
  const normalizedManagerKey = normalizeManagerKey(managerKey);
  return state.byManagerKey[normalizedManagerKey]?.rounds[String(roundNumber)] ?? null;
}

export async function getManagerRoundScorePersistent(
  scope: TeamScoreScope,
  managerKey: string,
  roundNumber: number,
): Promise<TeamScoreRoundSnapshot | null> {
  const state = await readTeamScoreStatePersistent(scope);
  return getManagerRoundScore(state, managerKey, roundNumber);
}

export type TeamScoreSummary = {
  totalPoints: number;
  currentRoundPoints: number;
  roundsPlayed: number;
  latestRound: number | null;
};

export function summarizeManagerTeamScores(state: TeamScoreState, managerKey: string): TeamScoreSummary {
  const normalizedManagerKey = normalizeManagerKey(managerKey);
  const rounds = Object.values(state.byManagerKey[normalizedManagerKey]?.rounds ?? {}).sort((a, b) => a.roundNumber - b.roundNumber);
  if (rounds.length === 0) {
    return { totalPoints: 0, currentRoundPoints: 0, roundsPlayed: 0, latestRound: null };
  }

  const totalPoints = rounds.reduce((sum, round) => sum + round.totalPoints, 0);
  const latestRound = rounds[rounds.length - 1] ?? null;
  return {
    totalPoints,
    currentRoundPoints: latestRound?.totalPoints ?? 0,
    roundsPlayed: rounds.length,
    latestRound: latestRound?.roundNumber ?? null,
  };
}

export async function summarizeManagerTeamScoresPersistent(scope: TeamScoreScope, managerKey: string): Promise<TeamScoreSummary> {
  const state = await readTeamScoreStatePersistent(scope);
  return summarizeManagerTeamScores(state, managerKey);
}

export async function resetTeamScoreStatePersistent(scope: TeamScoreScope = "eredivisie") {
  await writeTeamScoreStatePersistent({ ...DEFAULT_STATE }, scope);
}

export function resetTeamScoreStateForTests(scope: TeamScoreScope = "eredivisie") {
  saveTeamScoreState({ ...DEFAULT_STATE }, scope);
}

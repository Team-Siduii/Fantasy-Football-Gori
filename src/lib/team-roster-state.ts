import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { isGoriDatabaseEnabled, readPersistentJson, writePersistentJson } from "./persistent-json-store";

export type TeamRosterState = {
  byTeamId: Record<string, string[]>;
};

export type TeamRosterScope = "eredivisie" | "wk";

const DEFAULT_TEAM_ROSTER_STATE: TeamRosterState = {
  byTeamId: {},
};

export function resolveTeamRosterStatePath(scope: TeamRosterScope = "eredivisie") {
  if (scope === "wk" && process.env.TEAM_ROSTER_STATE_WK_PATH) {
    return process.env.TEAM_ROSTER_STATE_WK_PATH;
  }
  if (scope === "eredivisie" && process.env.TEAM_ROSTER_STATE_PATH) {
    return process.env.TEAM_ROSTER_STATE_PATH;
  }
  if (process.env.VERCEL) {
    return scope === "wk" ? "/tmp/team-roster-state-wk.json" : "/tmp/team-roster-state.json";
  }
  return path.join(process.cwd(), "data", scope === "wk" ? "team-roster-state-wk.json" : "team-roster-state.json");
}

export function readTeamRosterState(scope: TeamRosterScope = "eredivisie"): TeamRosterState {
  const target = resolveTeamRosterStatePath(scope);
  if (!existsSync(target)) {
    return { ...DEFAULT_TEAM_ROSTER_STATE };
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as Partial<TeamRosterState>;
    const byTeamId = parsed.byTeamId ?? {};
    const normalized: Record<string, string[]> = {};
    for (const [teamId, playerIds] of Object.entries(byTeamId)) {
      normalized[teamId] = Array.isArray(playerIds) ? playerIds.filter((id): id is string => typeof id === "string") : [];
    }
    return { byTeamId: normalized };
  } catch {
    return { ...DEFAULT_TEAM_ROSTER_STATE };
  }
}

export function saveTeamRosterState(next: TeamRosterState, scope: TeamRosterScope = "eredivisie"): TeamRosterState {
  const target = resolveTeamRosterStatePath(scope);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

async function writeTeamRosterStatePersistent(next: TeamRosterState, scope: TeamRosterScope = "eredivisie") {
  saveTeamRosterState(next, scope);
  if (isGoriDatabaseEnabled()) {
    await writePersistentJson({ store: "team-roster-state", scope }, next);
  }
  return next;
}

export async function readTeamRosterStatePersistent(scope: TeamRosterScope = "eredivisie"): Promise<TeamRosterState> {
  const fallback = readTeamRosterState(scope);
  if (!isGoriDatabaseEnabled()) {
    return fallback;
  }
  const persisted = await readPersistentJson({ store: "team-roster-state", scope }, fallback);
  saveTeamRosterState(persisted, scope);
  return persisted;
}

export async function addPlayerToTeamRosterPersistent(teamId: string, playerId: string, scope: TeamRosterScope = "eredivisie") {
  const state = await readTeamRosterStatePersistent(scope);
  const current = state.byTeamId[teamId] ?? [];
  if (!current.includes(playerId)) {
    state.byTeamId[teamId] = [...current, playerId];
    await writeTeamRosterStatePersistent(state, scope);
  }
  return readTeamRosterStatePersistent(scope);
}

export async function removePlayerFromTeamRosterPersistent(teamId: string, playerId: string, scope: TeamRosterScope = "eredivisie") {
  const state = await readTeamRosterStatePersistent(scope);
  const current = state.byTeamId[teamId] ?? [];
  state.byTeamId[teamId] = current.filter((id) => id !== playerId);
  await writeTeamRosterStatePersistent(state, scope);
  return readTeamRosterStatePersistent(scope);
}

export async function resetTeamRosterStatePersistent(scope: TeamRosterScope = "eredivisie") {
  await writeTeamRosterStatePersistent({ ...DEFAULT_TEAM_ROSTER_STATE }, scope);
}

export function addPlayerToTeamRoster(teamId: string, playerId: string, scope: TeamRosterScope = "eredivisie") {
  const state = readTeamRosterState(scope);
  const current = state.byTeamId[teamId] ?? [];
  if (!current.includes(playerId)) {
    state.byTeamId[teamId] = [...current, playerId];
    saveTeamRosterState(state, scope);
  }
  return readTeamRosterState(scope);
}

export function removePlayerFromTeamRoster(teamId: string, playerId: string, scope: TeamRosterScope = "eredivisie") {
  const state = readTeamRosterState(scope);
  const current = state.byTeamId[teamId] ?? [];
  state.byTeamId[teamId] = current.filter((id) => id !== playerId);
  saveTeamRosterState(state, scope);
  return readTeamRosterState(scope);
}

export function resetTeamRosterState(scope: TeamRosterScope = "eredivisie") {
  saveTeamRosterState({ ...DEFAULT_TEAM_ROSTER_STATE }, scope);
}

export function resetTeamRosterStateForTests(scope: TeamRosterScope = "eredivisie") {
  resetTeamRosterState(scope);
}

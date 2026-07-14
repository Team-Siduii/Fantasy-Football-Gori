import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { isGoriDatabaseEnabled, readPersistentJson, writePersistentJson } from "./persistent-json-store";
import { resolveCanonicalManagerId } from "./manager-identity";

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

function normalizeTeamRosterState(input: Partial<TeamRosterState>): TeamRosterState {
  const byTeamId = input.byTeamId ?? {};
  const normalized: Record<string, string[]> = {};
  for (const [teamId, playerIds] of Object.entries(byTeamId)) {
    const canonicalTeamId = resolveCanonicalManagerId("eredivisie", teamId) ?? resolveCanonicalManagerId("wk", teamId) ?? teamId;
    const nextPlayerIds = Array.isArray(playerIds) ? playerIds.filter((id): id is string => typeof id === "string") : [];
    normalized[canonicalTeamId] = Array.from(new Set([...(normalized[canonicalTeamId] ?? []), ...nextPlayerIds]));
  }
  return { byTeamId: normalized };
}

function resolveRosterTeamKey(scope: TeamRosterScope, teamId: string) {
  return resolveCanonicalManagerId(scope, teamId) ?? teamId.trim();
}

export function readTeamRosterState(scope: TeamRosterScope = "eredivisie"): TeamRosterState {
  const target = resolveTeamRosterStatePath(scope);
  if (!existsSync(target)) {
    return { ...DEFAULT_TEAM_ROSTER_STATE };
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as Partial<TeamRosterState>;
    return normalizeTeamRosterState(parsed);
  } catch {
    return { ...DEFAULT_TEAM_ROSTER_STATE };
  }
}

export function saveTeamRosterState(next: TeamRosterState, scope: TeamRosterScope = "eredivisie"): TeamRosterState {
  const target = resolveTeamRosterStatePath(scope);
  mkdirSync(path.dirname(target), { recursive: true });
  const normalized = normalizeTeamRosterState(next);
  writeFileSync(target, JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
}

async function writeTeamRosterStatePersistent(next: TeamRosterState, scope: TeamRosterScope = "eredivisie") {
  const normalized = saveTeamRosterState(next, scope);
  if (isGoriDatabaseEnabled()) {
    await writePersistentJson({ store: "team-roster-state", scope }, normalized);
  }
  return normalized;
}

export async function readTeamRosterStatePersistent(scope: TeamRosterScope = "eredivisie"): Promise<TeamRosterState> {
  const fallback = readTeamRosterState(scope);
  if (!isGoriDatabaseEnabled()) {
    return fallback;
  }

  try {
    const persisted = await readPersistentJson({ store: "team-roster-state", scope }, fallback);
    const normalized = normalizeTeamRosterState(persisted);
    try {
      saveTeamRosterState(normalized, scope);
    } catch {
      // Keep request-time roster reads fail-soft even if local file sync is unavailable.
    }
    return normalized;
  } catch {
    return fallback;
  }
}

export async function addPlayerToTeamRosterPersistent(teamId: string, playerId: string, scope: TeamRosterScope = "eredivisie") {
  const state = await readTeamRosterStatePersistent(scope);
  const rosterTeamKey = resolveRosterTeamKey(scope, teamId);
  const current = state.byTeamId[rosterTeamKey] ?? [];
  if (!current.includes(playerId)) {
    state.byTeamId[rosterTeamKey] = [...current, playerId];
    await writeTeamRosterStatePersistent(state, scope);
  }
  return readTeamRosterStatePersistent(scope);
}

export async function removePlayerFromTeamRosterPersistent(teamId: string, playerId: string, scope: TeamRosterScope = "eredivisie") {
  const state = await readTeamRosterStatePersistent(scope);
  const rosterTeamKey = resolveRosterTeamKey(scope, teamId);
  const current = state.byTeamId[rosterTeamKey] ?? [];
  state.byTeamId[rosterTeamKey] = current.filter((id) => id !== playerId);
  await writeTeamRosterStatePersistent(state, scope);
  return readTeamRosterStatePersistent(scope);
}

export async function setTeamRosterForManagerPersistent(teamId: string, playerIds: string[], scope: TeamRosterScope = "eredivisie") {
  const state = await readTeamRosterStatePersistent(scope);
  state.byTeamId[resolveRosterTeamKey(scope, teamId)] = Array.from(new Set(playerIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)));
  await writeTeamRosterStatePersistent(state, scope);
  return readTeamRosterStatePersistent(scope);
}

export async function resetTeamRosterStatePersistent(scope: TeamRosterScope = "eredivisie") {
  await writeTeamRosterStatePersistent({ ...DEFAULT_TEAM_ROSTER_STATE }, scope);
}

export function addPlayerToTeamRoster(teamId: string, playerId: string, scope: TeamRosterScope = "eredivisie") {
  const state = readTeamRosterState(scope);
  const rosterTeamKey = resolveRosterTeamKey(scope, teamId);
  const current = state.byTeamId[rosterTeamKey] ?? [];
  if (!current.includes(playerId)) {
    state.byTeamId[rosterTeamKey] = [...current, playerId];
    saveTeamRosterState(state, scope);
  }
  return readTeamRosterState(scope);
}

export function removePlayerFromTeamRoster(teamId: string, playerId: string, scope: TeamRosterScope = "eredivisie") {
  const state = readTeamRosterState(scope);
  const rosterTeamKey = resolveRosterTeamKey(scope, teamId);
  const current = state.byTeamId[rosterTeamKey] ?? [];
  state.byTeamId[rosterTeamKey] = current.filter((id) => id !== playerId);
  saveTeamRosterState(state, scope);
  return readTeamRosterState(scope);
}

export function setTeamRosterForManager(teamId: string, playerIds: string[], scope: TeamRosterScope = "eredivisie") {
  const state = readTeamRosterState(scope);
  state.byTeamId[resolveRosterTeamKey(scope, teamId)] = Array.from(new Set(playerIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)));
  saveTeamRosterState(state, scope);
  return readTeamRosterState(scope);
}

export function resetTeamRosterState(scope: TeamRosterScope = "eredivisie") {
  saveTeamRosterState({ ...DEFAULT_TEAM_ROSTER_STATE }, scope);
}

export function resetTeamRosterStateForTests(scope: TeamRosterScope = "eredivisie") {
  resetTeamRosterState(scope);
}

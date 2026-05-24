import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export type TeamRosterState = {
  byTeamId: Record<string, string[]>;
};

const DEFAULT_TEAM_ROSTER_STATE: TeamRosterState = {
  byTeamId: {},
};

export function resolveTeamRosterStatePath() {
  if (process.env.TEAM_ROSTER_STATE_PATH) {
    return process.env.TEAM_ROSTER_STATE_PATH;
  }
  if (process.env.VERCEL) {
    return "/tmp/team-roster-state.json";
  }
  return path.join(process.cwd(), "data", "team-roster-state.json");
}

export function readTeamRosterState(): TeamRosterState {
  const target = resolveTeamRosterStatePath();
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

export function saveTeamRosterState(next: TeamRosterState): TeamRosterState {
  const target = resolveTeamRosterStatePath();
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export function addPlayerToTeamRoster(teamId: string, playerId: string) {
  const state = readTeamRosterState();
  const current = state.byTeamId[teamId] ?? [];
  if (!current.includes(playerId)) {
    state.byTeamId[teamId] = [...current, playerId];
    saveTeamRosterState(state);
  }
  return readTeamRosterState();
}

export function removePlayerFromTeamRoster(teamId: string, playerId: string) {
  const state = readTeamRosterState();
  const current = state.byTeamId[teamId] ?? [];
  state.byTeamId[teamId] = current.filter((id) => id !== playerId);
  saveTeamRosterState(state);
  return readTeamRosterState();
}

export function resetTeamRosterStateForTests() {
  saveTeamRosterState({ ...DEFAULT_TEAM_ROSTER_STATE });
}

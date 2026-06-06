import { AUTH_TEST_ACCOUNT_PRESETS } from "./auth-test-accounts";
import { listManagerProfiles } from "./auth-store";
import { getLeagueAdminConfig, type LeagueMode } from "./league-admin-config";
import { readManagerState, saveManagerState, type ManagerStateScope } from "./manager-state";
import { readTeamRosterState } from "./team-roster-state";

const DEFAULT_FORMATION = "4-3-3";
const LINEUP_SIZE = 11;
const SQUAD_SIZE = 15;

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function valuesMatch(teamId: string, candidates: Array<string | undefined | null>) {
  const target = normalize(teamId);
  if (!target) {
    return false;
  }

  return candidates.some((candidate) => typeof candidate === "string" && normalize(candidate) === target);
}

export function resolveDraftTeamManagerEmail(teamId: string, scope: ManagerStateScope = "eredivisie"): string | null {
  const target = normalize(teamId);
  if (!target) {
    return null;
  }

  const config = getLeagueAdminConfig(scope as LeagueMode);
  const participant = config.participants.find((candidate) =>
    valuesMatch(teamId, [candidate.label, candidate.managerId, candidate.email]),
  );
  if (participant?.email) {
    return normalizeEmail(participant.email);
  }

  const runtimeProfile = listManagerProfiles().find((profile) =>
    valuesMatch(teamId, [profile.name, profile.teamName, profile.email]),
  );
  if (runtimeProfile?.email) {
    return normalizeEmail(runtimeProfile.email);
  }

  const account = AUTH_TEST_ACCOUNT_PRESETS.find((preset) => {
    const candidates = [preset.id, preset.label, preset.name, preset.teamName, preset.email];
    return valuesMatch(teamId, candidates);
  });

  return account?.email.trim().toLowerCase() ?? null;
}

function buildManagerTeamState(playerIds: string[], formation = DEFAULT_FORMATION) {
  const uniquePlayerIds = Array.from(
    new Set(playerIds.filter((id) => typeof id === "string" && id.trim().length > 0)),
  ).slice(0, SQUAD_SIZE);

  return {
    formation,
    lineupIds: uniquePlayerIds.slice(0, LINEUP_SIZE),
    benchIds: uniquePlayerIds.slice(LINEUP_SIZE, SQUAD_SIZE),
    pendingSellId: null,
    pendingBuyId: null,
    pickedTransferId: null,
  };
}

export function syncDraftRosterToManagerTeam(input: {
  teamId: string;
  playerIds: string[];
  scope: ManagerStateScope;
  formation?: string;
}) {
  const managerEmail = resolveDraftTeamManagerEmail(input.teamId, input.scope);
  if (!managerEmail) {
    return null;
  }

  const state = saveManagerState(buildManagerTeamState(input.playerIds, input.formation), input.scope, managerEmail);

  return { managerEmail, state };
}

export function syncManagerTeamFromDraftRoster(input: { managerEmail: string; scope: ManagerStateScope }) {
  const managerEmail = normalizeEmail(input.managerEmail);
  if (!managerEmail) {
    return null;
  }

  const rosters = readTeamRosterState(input.scope).byTeamId;
  const match = Object.entries(rosters).find(([teamId]) => resolveDraftTeamManagerEmail(teamId, input.scope) === managerEmail);
  if (!match) {
    return null;
  }

  const [, playerIds] = match;
  const current = readManagerState(input.scope, managerEmail);
  const next = buildManagerTeamState(playerIds, current.formation || DEFAULT_FORMATION);
  const currentIds = [...current.lineupIds, ...current.benchIds];
  const nextIds = [...next.lineupIds, ...next.benchIds];

  if (currentIds.join("\u0000") === nextIds.join("\u0000")) {
    return { managerEmail, state: current, changed: false };
  }

  const state = saveManagerState(next, input.scope, managerEmail);
  return { managerEmail, state, changed: true };
}

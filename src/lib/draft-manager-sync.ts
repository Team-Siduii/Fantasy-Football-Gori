import { buildFormationSlots, getFormationOptions } from "../domain/formation";
import type { PlayerRecord } from "../domain/player";
import { AUTH_TEST_ACCOUNT_PRESETS } from "./auth-test-accounts";
import { listManagerProfiles } from "./auth-store";
import { getLeagueAdminConfig, getLeagueAdminConfigPersistent, type LeagueMode } from "./league-admin-config";
import {
  readManagerState,
  readManagerStatePersistent,
  saveManagerState,
  saveManagerStatePersistent,
  type ManagerStateScope,
} from "./manager-state";
import { readTeamRosterState, readTeamRosterStatePersistent } from "./team-roster-state";

const DEFAULT_FORMATION = "4-3-3";
const LINEUP_SIZE = 11;
const SQUAD_SIZE = 15;

type DraftPosition = "GK" | "DEF" | "MID" | "FWD";
type DraftPlayerCatalogEntry = Pick<PlayerRecord, "id" | "positie">;

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

export async function resolveDraftTeamManagerEmailPersistent(
  teamId: string,
  scope: ManagerStateScope = "eredivisie",
): Promise<string | null> {
  const target = normalize(teamId);
  if (!target) {
    return null;
  }

  const config = await getLeagueAdminConfigPersistent(scope as LeagueMode);
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

function normalizeDraftPosition(position: string): DraftPosition | null {
  const normalized = position.trim().toUpperCase();
  if (["GK", "KEEPER", "GOALKEEPER", "DOELMAN"].includes(normalized)) return "GK";
  if (["DEF", "VERDEDIGER", "DEFENDER"].includes(normalized)) return "DEF";
  if (["MID", "MIDDENVELDER", "MIDFIELDER"].includes(normalized)) return "MID";
  if (["FWD", "AANVALLER", "FORWARD", "ATTACKER"].includes(normalized)) return "FWD";
  return null;
}

function buildAutoFormationTeamState(playerIds: string[], playerCatalog: DraftPlayerCatalogEntry[]) {
  const playersById = new Map(playerCatalog.map((player) => [player.id, player]));
  const uniquePlayerIds = Array.from(
    new Set(playerIds.filter((id) => typeof id === "string" && id.trim().length > 0)),
  ).slice(0, SQUAD_SIZE);
  const idsByPosition: Record<DraftPosition, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  const unknownIds: string[] = [];

  for (const playerId of uniquePlayerIds) {
    const position = normalizeDraftPosition(playersById.get(playerId)?.positie ?? "");
    if (position) {
      idsByPosition[position].push(playerId);
    } else {
      unknownIds.push(playerId);
    }
  }

  const options = getFormationOptions();
  let bestFormation = options[0] ?? DEFAULT_FORMATION;
  let bestLineupCount = -1;

  for (const formation of options) {
    const slotCounts: Record<DraftPosition, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const row of buildFormationSlots(formation)) {
      for (const slot of row) {
        slotCounts[slot] += 1;
      }
    }
    const lineupCount = (Object.keys(slotCounts) as DraftPosition[]).reduce(
      (sum, position) => sum + Math.min(slotCounts[position], idsByPosition[position].length),
      0,
    );
    if (lineupCount > bestLineupCount) {
      bestFormation = formation;
      bestLineupCount = lineupCount;
    }
  }

  const used = new Set<string>();
  const lineupIds: string[] = [];
  for (const position of buildFormationSlots(bestFormation).flat()) {
    const next = idsByPosition[position].find((id) => !used.has(id));
    if (next) {
      used.add(next);
      lineupIds.push(next);
    }
  }

  for (const playerId of unknownIds) {
    if (lineupIds.length >= LINEUP_SIZE) break;
    used.add(playerId);
    lineupIds.push(playerId);
  }

  const benchIds = uniquePlayerIds.filter((id) => !used.has(id)).slice(0, SQUAD_SIZE - lineupIds.length);
  return { formation: bestFormation, lineupIds, benchIds };
}

function buildManagerTeamState(playerIds: string[], formation = DEFAULT_FORMATION, playerCatalog?: DraftPlayerCatalogEntry[]) {
  const uniquePlayerIds = Array.from(
    new Set(playerIds.filter((id) => typeof id === "string" && id.trim().length > 0)),
  ).slice(0, SQUAD_SIZE);

  if (playerCatalog && playerCatalog.length > 0) {
    const autoFilled = buildAutoFormationTeamState(uniquePlayerIds, playerCatalog);
    return {
      ...autoFilled,
      pendingSellId: null,
      pendingBuyId: null,
      pickedTransferId: null,
    };
  }

  return {
    formation,
    lineupIds: uniquePlayerIds.slice(0, LINEUP_SIZE),
    benchIds: uniquePlayerIds.slice(LINEUP_SIZE, SQUAD_SIZE),
    pendingSellId: null,
    pendingBuyId: null,
    pickedTransferId: null,
  };
}

function buildManagerTeamStateWithRoundSnapshots(
  playerIds: string[],
  current: ReturnType<typeof readManagerState>,
  playerCatalog?: DraftPlayerCatalogEntry[],
) {
  const next = buildManagerTeamState(playerIds, current.formation || DEFAULT_FORMATION, playerCatalog);
  const roundStates = Object.fromEntries(Object.keys(current.roundStates).map((roundKey) => [roundKey, next]));

  return {
    ...next,
    roundStates,
  };
}

export function syncDraftRosterToManagerTeam(input: {
  teamId: string;
  playerIds: string[];
  scope: ManagerStateScope;
  formation?: string;
  playerCatalog?: DraftPlayerCatalogEntry[];
}) {
  const managerEmail = resolveDraftTeamManagerEmail(input.teamId, input.scope);
  if (!managerEmail) {
    return null;
  }

  const current = readManagerState(input.scope, managerEmail);
  const state = saveManagerState(
    buildManagerTeamStateWithRoundSnapshots(input.playerIds, current, input.playerCatalog),
    input.scope,
    managerEmail,
  );

  return { managerEmail, state };
}

export async function syncDraftRosterToManagerTeamPersistent(input: {
  teamId: string;
  playerIds: string[];
  scope: ManagerStateScope;
  formation?: string;
  playerCatalog?: DraftPlayerCatalogEntry[];
}) {
  const managerEmail = await resolveDraftTeamManagerEmailPersistent(input.teamId, input.scope);
  if (!managerEmail) {
    return null;
  }

  const current = await readManagerStatePersistent(input.scope, managerEmail);
  const state = await saveManagerStatePersistent(
    buildManagerTeamStateWithRoundSnapshots(input.playerIds, current, input.playerCatalog),
    input.scope,
    managerEmail,
  );

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
  const next = buildManagerTeamStateWithRoundSnapshots(playerIds, current);
  const currentIds = [...current.lineupIds, ...current.benchIds];
  const nextIds = [...next.lineupIds, ...next.benchIds];

  if (currentIds.join("\u0000") === nextIds.join("\u0000")) {
    return { managerEmail, state: current, changed: false };
  }

  const state = saveManagerState(next, input.scope, managerEmail);
  return { managerEmail, state, changed: true };
}

export async function syncManagerTeamFromDraftRosterPersistent(input: { managerEmail: string; scope: ManagerStateScope }) {
  const managerEmail = normalizeEmail(input.managerEmail);
  if (!managerEmail) {
    return null;
  }

  const rosters = (await readTeamRosterStatePersistent(input.scope)).byTeamId;
  // Resolve alle team IDs naar manager emails via de persistente config
  const teamEmailEntries = await Promise.all(
    Object.keys(rosters).map(async (teamId) => ({
      teamId,
      email: await resolveDraftTeamManagerEmailPersistent(teamId, input.scope),
    })),
  );
  const teamEmailMap = new Map(teamEmailEntries.filter((e) => e.email).map((e) => [e.teamId, e.email!]));
  const match = Object.entries(rosters).find(([teamId]) => teamEmailMap.get(teamId) === managerEmail);
  if (!match) {
    return null;
  }

  const [, playerIds] = match;
  const current = await readManagerStatePersistent(input.scope, managerEmail);
  const next = buildManagerTeamStateWithRoundSnapshots(playerIds, current);
  const currentIds = [...current.lineupIds, ...current.benchIds];
  const nextIds = [...next.lineupIds, ...next.benchIds];

  if (currentIds.join("\u0000") === nextIds.join("\u0000")) {
    return { managerEmail, state: current, changed: false };
  }

  const state = await saveManagerStatePersistent(next, input.scope, managerEmail);
  return { managerEmail, state, changed: true };
}

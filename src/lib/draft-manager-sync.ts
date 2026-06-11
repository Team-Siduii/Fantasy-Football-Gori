import { buildFormationSlots, getFormationOptions } from "../domain/formation";
import type { PlayerRecord } from "../domain/player";
import { AUTH_TEST_ACCOUNT_PRESETS } from "./auth-test-accounts";
import { getAuthAccountByEmail, listManagerProfiles } from "./auth-store";
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
type ManagerIdentity = {
  aliases: Set<string>;
  emails: Set<string>;
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeIdentityValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function addIdentityValue(target: Set<string>, value?: string | null) {
  if (typeof value !== "string") {
    return;
  }

  const normalized = normalizeIdentityValue(value);
  if (normalized) {
    target.add(normalized);
  }
}

function addIdentityEmail(target: Set<string>, value?: string | null) {
  if (typeof value !== "string") {
    return;
  }

  const normalized = normalizeEmail(value);
  if (normalized) {
    target.add(normalized);
  }
}

function valuesMatch(teamId: string, candidates: Array<string | undefined | null>) {
  const target = normalize(teamId);
  if (!target) {
    return false;
  }

  return candidates.some((candidate) => typeof candidate === "string" && normalize(candidate) === target);
}

function buildManagerIdentity(managerEmail: string, scope: ManagerStateScope): ManagerIdentity {
  const aliases = new Set<string>();
  const emails = new Set<string>();
  const normalizedManagerEmail = normalizeEmail(managerEmail);
  const config = getLeagueAdminConfig(scope as LeagueMode);
  const runtimeAccount = getAuthAccountByEmail(normalizedManagerEmail);

  addIdentityValue(aliases, normalizedManagerEmail);
  addIdentityEmail(emails, normalizedManagerEmail);

  if (runtimeAccount) {
    addIdentityValue(aliases, runtimeAccount.id);
    addIdentityValue(aliases, runtimeAccount.profile.name);
    addIdentityValue(aliases, runtimeAccount.profile.teamName);
    addIdentityValue(aliases, runtimeAccount.profile.email);
    addIdentityEmail(emails, runtimeAccount.profile.email);
  }

  const participant = config.participants.find((candidate) => {
    if (runtimeAccount?.id && candidate.managerId === runtimeAccount.id) {
      return true;
    }

    const participantEmail = normalizeEmail(candidate.email);
    return participantEmail === normalizedManagerEmail || emails.has(participantEmail);
  });

  if (participant) {
    addIdentityValue(aliases, participant.managerId);
    addIdentityValue(aliases, participant.label);
    addIdentityValue(aliases, participant.email);
    addIdentityEmail(emails, participant.email);
  }

  const preset = AUTH_TEST_ACCOUNT_PRESETS.find((candidate) => {
    if (runtimeAccount?.id && candidate.id === runtimeAccount.id) {
      return true;
    }

    const presetEmail = normalizeEmail(candidate.email);
    return presetEmail === normalizedManagerEmail || emails.has(presetEmail);
  });

  if (preset) {
    addIdentityValue(aliases, preset.id);
    addIdentityValue(aliases, preset.label);
    addIdentityValue(aliases, preset.name);
    addIdentityValue(aliases, preset.teamName);
    addIdentityValue(aliases, preset.email);
    addIdentityEmail(emails, preset.email);
  }

  return { aliases, emails };
}

function teamIdMatchesManagerIdentity(teamId: string, identity: ManagerIdentity) {
  return identity.aliases.has(normalizeIdentityValue(teamId));
}

function teamIdResolvesToManagerIdentity(teamId: string, identity: ManagerIdentity, scope: ManagerStateScope) {
  const resolvedEmail = resolveDraftTeamManagerEmail(teamId, scope);
  return resolvedEmail ? identity.emails.has(resolvedEmail) : false;
}

function findRosterMatch(
  rosters: Record<string, string[]>,
  identity: ManagerIdentity,
  scope: ManagerStateScope,
): [string, string[]] | undefined {
  return Object.entries(rosters).find(
    ([teamId]) => teamIdMatchesManagerIdentity(teamId, identity) || teamIdResolvesToManagerIdentity(teamId, identity, scope),
  );
}

export function resolveDraftTeamManagerEmail(teamId: string, scope: ManagerStateScope = "eredivisie"): string | null {
  const target = normalize(teamId);
  if (!target) {
    return null;
  }

  const config = getLeagueAdminConfig(scope as LeagueMode);
  const participant = config.participants.find((candidate) => valuesMatch(teamId, [candidate.label, candidate.managerId, candidate.email]));
  if (participant?.email) {
    return normalizeEmail(participant.email);
  }

  const runtimeProfile = listManagerProfiles().find((profile) => valuesMatch(teamId, [profile.name, profile.teamName, profile.email]));
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

export function syncPlayerIdsToManagerTeam(input: {
  managerEmail: string;
  playerIds: string[];
  scope: ManagerStateScope;
  playerCatalog?: DraftPlayerCatalogEntry[];
}) {
  const managerEmail = normalizeEmail(input.managerEmail);
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

export async function syncPlayerIdsToManagerTeamPersistent(input: {
  managerEmail: string;
  playerIds: string[];
  scope: ManagerStateScope;
  playerCatalog?: DraftPlayerCatalogEntry[];
}) {
  const managerEmail = normalizeEmail(input.managerEmail);
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

  return syncPlayerIdsToManagerTeam({
    managerEmail,
    playerIds: input.playerIds,
    scope: input.scope,
    playerCatalog: input.playerCatalog,
  });
}

export async function syncDraftRosterToManagerTeamPersistent(input: {
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

  return syncPlayerIdsToManagerTeamPersistent({
    managerEmail,
    playerIds: input.playerIds,
    scope: input.scope,
    playerCatalog: input.playerCatalog,
  });
}

export function syncManagerTeamFromDraftRoster(input: { managerEmail: string; scope: ManagerStateScope }) {
  const managerEmail = normalizeEmail(input.managerEmail);
  if (!managerEmail) {
    return null;
  }

  const rosters = readTeamRosterState(input.scope).byTeamId;
  const identity = buildManagerIdentity(managerEmail, input.scope);
  const match = findRosterMatch(rosters, identity, input.scope);
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
    console.log("[SYNC-ROSTER] No managerEmail");
    return null;
  }

  const rosters = (await readTeamRosterStatePersistent(input.scope)).byTeamId;
  console.log("[SYNC-ROSTER] Roster team IDs:", Object.keys(rosters));

  const identity = buildManagerIdentity(managerEmail, input.scope);
  console.log("[SYNC-ROSTER] Identity aliases:", [...identity.aliases]);

  const match = findRosterMatch(rosters, identity, input.scope);

  if (!match) {
    console.log("[SYNC-ROSTER] No roster match for", managerEmail);
    return null;
  }

  const [, playerIds] = match;
  console.log("[SYNC-ROSTER] Matched team:", match[0], "with", playerIds.length, "players:", playerIds);
  
  const current = await readManagerStatePersistent(input.scope, managerEmail);
  console.log("[SYNC-ROSTER] Current state lineupIds:", current.lineupIds, "benchIds:", current.benchIds);

  // Alleen initialiseren als de state leeg is (nog geen spelers).
  // Zodra een manager spelers heeft (uit draft of transfers) NIET overschrijven —
  // anders gaan transfers verloren bij elke sync.
  const currentIds = [...current.lineupIds, ...current.benchIds];
  if (currentIds.length > 0) {
    console.log("[SYNC-ROSTER] State already has", currentIds.length, "players — skipping init");
    return { managerEmail, state: current, changed: false };
  }

  console.log("[SYNC-ROSTER] State empty — initializing from roster");

  const next = buildManagerTeamStateWithRoundSnapshots(playerIds, current);
  const nextIds = [...next.lineupIds, ...next.benchIds];

  if (currentIds.join("\u0000") === nextIds.join("\u0000")) {
    return { managerEmail, state: current, changed: false };
  }

  const state = await saveManagerStatePersistent(next, input.scope, managerEmail);
  return { managerEmail, state, changed: true };
}

export async function repairManagerTeamFromDraftArtifactsPersistent(input: {
  managerEmail: string;
  scope: ManagerStateScope;
}) {
  const managerEmail = normalizeEmail(input.managerEmail);
  if (!managerEmail) {
    console.log("[REPAIR] No managerEmail");
    return null;
  }

  console.log("[REPAIR] Start for", managerEmail, "scope:", input.scope);

  const rosterRepair = await syncManagerTeamFromDraftRosterPersistent(input);
  if (rosterRepair) {
    console.log("[REPAIR] Roster repair SUCCESS for", managerEmail, "playerIds:", [...rosterRepair.state.lineupIds, ...rosterRepair.state.benchIds]);
    return rosterRepair;
  }

  console.log("[REPAIR] No roster match for", managerEmail, ", falling back to draft picks");

  const identity = buildManagerIdentity(managerEmail, input.scope);
  console.log("[REPAIR] Identity aliases for", managerEmail, ":", [...identity.aliases]);

  const { readDraftStatePersistent } = await import("./draft-state");
  const draft = await readDraftStatePersistent(input.scope);
  console.log("[REPAIR] Draft picks count:", draft.picks.length, "teamOrder:", draft.teamOrder);

  const playerIds = draft.picks
    .filter((pick) => {
      const aliasMatch = teamIdMatchesManagerIdentity(pick.teamId, identity);
      const emailMatch = teamIdResolvesToManagerIdentity(pick.teamId, identity, input.scope);
      if (aliasMatch || emailMatch) {
        console.log("[REPAIR] Pick match for", pick.teamId, "player:", pick.playerId, "aliasMatch:", aliasMatch, "emailMatch:", emailMatch);
        return true;
      }
      return false;
    })
    .map((pick) => pick.playerId);

  console.log("[REPAIR] Matched playerIds for", managerEmail, ":", playerIds);

  if (playerIds.length === 0) {
    console.log("[REPAIR] No picks match for", managerEmail);
    return null;
  }

  const result = await syncPlayerIdsToManagerTeamPersistent({
    managerEmail,
    playerIds,
    scope: input.scope,
  });

  console.log("[REPAIR] Sync result for", managerEmail, ":", result ? "SUCCESS" : "NULL");

  return result ? { ...result, changed: true, repairedFrom: "draft-picks" as const } : null;
}

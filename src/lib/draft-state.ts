import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { buildFormationSlots, getFormationOptions } from "../domain/formation";
import type { PlayerRecord } from "../domain/player";
import { buildDraftPickSequence, type DraftOrderType } from "../domain/rules";
import { calculateSquadCost } from "../domain/team-budget";
import { syncDraftRosterToManagerTeam, syncDraftRosterToManagerTeamPersistent } from "./draft-manager-sync";
import {
  addPlayerToTeamRoster,
  addPlayerToTeamRosterPersistent,
  removePlayerFromTeamRoster,
  removePlayerFromTeamRosterPersistent,
  resetTeamRosterState,
  resetTeamRosterStatePersistent,
  type TeamRosterScope,
} from "./team-roster-state";
import { isGoriDatabaseEnabled, readPersistentJson, writePersistentJson } from "./persistent-json-store";

export type DraftScope = TeamRosterScope;

export type DraftStatus = "IDLE" | "ACTIVE" | "COMPLETED";

export type DraftPick = {
  pickNumber: number;
  teamId: string;
  playerId: string;
  pickedAt: string;
};

export type DraftEvent = {
  type: "DRAFT_STARTED" | "PLAYER_PICKED" | "PLAYER_RETURNED";
  at: string;
  actorId: string;
  payload: Record<string, string | number>;
};

export type DraftState = {
  leagueId: string;
  status: DraftStatus;
  teamOrder: string[];
  orderType: DraftOrderType;
  totalRounds: number;
  totalPicks: number;
  pickSequence: string[];
  picks: DraftPick[];
  currentTurnTeamId: string | null;
  events: DraftEvent[];
};

const DEFAULT_DRAFT_STATE: DraftState = {
  leagueId: "default",
  status: "IDLE",
  teamOrder: [],
  orderType: "snake",
  totalRounds: 0,
  totalPicks: 0,
  pickSequence: [],
  picks: [],
  currentTurnTeamId: null,
  events: [],
};

export function resolveDraftStatePath(scope: DraftScope = "eredivisie") {
  if (scope === "wk" && process.env.DRAFT_STATE_WK_PATH) {
    return process.env.DRAFT_STATE_WK_PATH;
  }
  if (scope === "eredivisie" && process.env.DRAFT_STATE_PATH) {
    return process.env.DRAFT_STATE_PATH;
  }
  if (process.env.VERCEL) {
    return scope === "wk" ? "/tmp/draft-state-wk.json" : "/tmp/draft-state.json";
  }
  return path.join(process.cwd(), "data", scope === "wk" ? "draft-state-wk.json" : "draft-state.json");
}

export function readDraftState(scope: DraftScope = "eredivisie"): DraftState {
  const target = resolveDraftStatePath(scope);
  if (!existsSync(target)) {
    return { ...DEFAULT_DRAFT_STATE };
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as Partial<DraftState>;
    return normalizeDraftState(parsed);
  } catch {
    return { ...DEFAULT_DRAFT_STATE };
  }
}

function normalizeDraftState(parsed: Partial<DraftState>): DraftState {
  return {
    leagueId: typeof parsed.leagueId === "string" ? parsed.leagueId : "default",
    status: parsed.status === "ACTIVE" || parsed.status === "COMPLETED" ? parsed.status : "IDLE",
    teamOrder: Array.isArray(parsed.teamOrder) ? parsed.teamOrder.filter((s): s is string => typeof s === "string") : [],
    orderType: parsed.orderType === "linear" ? "linear" : "snake",
    totalRounds: typeof parsed.totalRounds === "number" ? parsed.totalRounds : 0,
    totalPicks: typeof parsed.totalPicks === "number" ? parsed.totalPicks : 0,
    pickSequence: Array.isArray(parsed.pickSequence)
      ? parsed.pickSequence.filter((s): s is string => typeof s === "string")
      : [],
    picks: Array.isArray(parsed.picks)
      ? parsed.picks.filter(
          (p): p is DraftPick =>
            typeof p === "object" &&
            p !== null &&
            typeof (p as DraftPick).pickNumber === "number" &&
            typeof (p as DraftPick).teamId === "string" &&
            typeof (p as DraftPick).playerId === "string" &&
            typeof (p as DraftPick).pickedAt === "string",
        )
      : [],
    currentTurnTeamId: typeof parsed.currentTurnTeamId === "string" ? parsed.currentTurnTeamId : null,
    events: Array.isArray(parsed.events)
      ? parsed.events.filter(
          (e): e is DraftEvent =>
            typeof e === "object" &&
            e !== null &&
            typeof (e as DraftEvent).type === "string" &&
            typeof (e as DraftEvent).at === "string" &&
            typeof (e as DraftEvent).actorId === "string" &&
            typeof (e as DraftEvent).payload === "object" &&
            (e as DraftEvent).payload !== null,
        )
      : [],
  };
}

function writeDraftState(next: DraftState, scope: DraftScope = "eredivisie"): DraftState {
  const target = resolveDraftStatePath(scope);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

async function writeDraftStatePersistent(next: DraftState, scope: DraftScope = "eredivisie"): Promise<DraftState> {
  writeDraftState(next, scope);
  if (isGoriDatabaseEnabled()) {
    await writePersistentJson({ store: "draft-state", scope }, next);
  }
  return next;
}

export async function readDraftStatePersistent(scope: DraftScope = "eredivisie"): Promise<DraftState> {
  const fallback = readDraftState(scope);
  if (!isGoriDatabaseEnabled()) {
    return fallback;
  }
  const persisted = await readPersistentJson({ store: "draft-state", scope }, fallback);
  const normalized = normalizeDraftState(persisted);
  writeDraftState(normalized, scope);
  return normalized;
}

function computeCurrentTurnTeamId(pickSequence: string[], picksCount: number): string | null {
  return pickSequence[picksCount] ?? null;
}

export function startDraft(input: {
  leagueId: string;
  teamOrder: string[];
  totalRounds: number;
  orderType?: DraftOrderType;
  startedBy: string;
  startedAt?: string;
  scope?: DraftScope;
}): DraftState {
  const next = buildStartedDraftState(input);
  const scope = input.scope ?? "eredivisie";
  resetTeamRosterState(scope);
  for (const teamId of input.teamOrder) {
    syncDraftRosterToManagerTeam({ teamId, playerIds: [], scope });
  }
  return writeDraftState(next, scope);
}

function buildStartedDraftState(input: {
  leagueId: string;
  teamOrder: string[];
  totalRounds: number;
  orderType?: DraftOrderType;
  startedBy: string;
  startedAt?: string;
  scope?: DraftScope;
}): DraftState {
  if (!Array.isArray(input.teamOrder) || input.teamOrder.length < 2) {
    throw new Error("teamOrder requires at least 2 teams");
  }
  if (!Number.isInteger(input.totalRounds) || input.totalRounds <= 0) {
    throw new Error("totalRounds must be a positive integer");
  }

  const totalPicks = input.teamOrder.length * input.totalRounds;
  const orderType = input.orderType ?? "snake";
  const pickSequence = buildDraftPickSequence(input.teamOrder, totalPicks, orderType);
  const at = input.startedAt ?? new Date().toISOString();

  return {
    leagueId: input.leagueId,
    status: "ACTIVE",
    teamOrder: [...input.teamOrder],
    orderType,
    totalRounds: input.totalRounds,
    totalPicks,
    pickSequence,
    picks: [],
    currentTurnTeamId: computeCurrentTurnTeamId(pickSequence, 0),
    events: [
      {
        type: "DRAFT_STARTED",
        at,
        actorId: input.startedBy,
        payload: {
          totalPicks,
        },
      },
    ],
  };
}

export async function startDraftPersistent(input: {
  leagueId: string;
  teamOrder: string[];
  totalRounds: number;
  orderType?: DraftOrderType;
  startedBy: string;
  startedAt?: string;
  scope?: DraftScope;
}): Promise<DraftState> {
  const next = buildStartedDraftState(input);
  const scope = input.scope ?? "eredivisie";
  await resetTeamRosterStatePersistent(scope);
  for (const teamId of input.teamOrder) {
    await syncDraftRosterToManagerTeamPersistent({ teamId, playerIds: [], scope });
  }
  return writeDraftStatePersistent(next, scope);
}

type DraftPickValidationPlayer = Pick<PlayerRecord, "id" | "positie" | "prijs" | "club">;

type DraftPosition = "GK" | "DEF" | "MID" | "FWD";

type DraftBenchComposition = Record<DraftPosition, number>;

const DEFAULT_DRAFT_BENCH_COMPOSITION: DraftBenchComposition = { GK: 1, DEF: 1, MID: 1, FWD: 1 };

function normalizeDraftPosition(position: string): DraftPosition | null {
  const normalized = position.trim().toUpperCase();
  if (["GK", "KEEPER", "GOALKEEPER", "DOELMAN"].includes(normalized)) return "GK";
  if (["DEF", "VERDEDIGER", "DEFENDER"].includes(normalized)) return "DEF";
  if (["MID", "MIDDENVELDER", "MIDFIELDER"].includes(normalized)) return "MID";
  if (["FWD", "AANVALLER", "FORWARD", "ATTACKER"].includes(normalized)) return "FWD";
  return null;
}

function buildPositionCountsForFormation(
  formation: string,
  benchComposition: DraftBenchComposition = DEFAULT_DRAFT_BENCH_COMPOSITION,
): DraftBenchComposition {
  const lineupCounts: DraftBenchComposition = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const row of buildFormationSlots(formation)) {
    for (const slot of row) {
      lineupCounts[slot] += 1;
    }
  }

  return {
    GK: lineupCounts.GK + benchComposition.GK,
    DEF: lineupCounts.DEF + benchComposition.DEF,
    MID: lineupCounts.MID + benchComposition.MID,
    FWD: lineupCounts.FWD + benchComposition.FWD,
  };
}

function hasViableFormationForCounts(
  actualPositionCounts: DraftBenchComposition,
  formationOptions = getFormationOptions(),
  benchComposition: DraftBenchComposition = DEFAULT_DRAFT_BENCH_COMPOSITION,
) {
  return formationOptions.some((formation) => {
    const maxCounts = buildPositionCountsForFormation(formation, benchComposition);
    return (Object.keys(actualPositionCounts) as DraftPosition[]).every(
      (position) => actualPositionCounts[position] <= maxCounts[position],
    );
  });
}

function countPlayersByCountry(players: DraftPickValidationPlayer[]) {
  const counts = new Map<string, number>();
  for (const player of players) {
    const country = player.club.trim().toLowerCase();
    if (!country) continue;
    counts.set(country, (counts.get(country) ?? 0) + 1);
  }
  return counts;
}

function validateDraftPickConstraints(input: {
  current: DraftState;
  teamId: string;
  playerId: string;
  playerCatalog?: DraftPickValidationPlayer[];
  budgetCap?: number;
  formationOptions?: string[];
  benchComposition?: DraftBenchComposition;
}) {
  if (!input.playerCatalog) {
    return;
  }

  const playersById = new Map(input.playerCatalog.map((player) => [player.id, player]));
  const selectedPlayerIds = input.current.picks
    .filter((pick) => pick.teamId === input.teamId)
    .map((pick) => pick.playerId);
  const candidatePlayerIds = [...selectedPlayerIds, input.playerId];
  const candidatePlayers = candidatePlayerIds
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is DraftPickValidationPlayer => Boolean(player));

  const pickedPlayer = playersById.get(input.playerId);
  if (!pickedPlayer) {
    throw new Error("speler niet gevonden in draftcatalogus");
  }

  if (typeof input.budgetCap === "number" && calculateSquadCost(candidatePlayers) > input.budgetCap) {
    throw new Error("maximale transferbudget overschreden");
  }

  for (const count of countPlayersByCountry(candidatePlayers).values()) {
    if (count > 2) {
      throw new Error("maximaal 2 spelers per land toegestaan");
    }
  }

  const actualPositionCounts: DraftBenchComposition = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

  for (const player of candidatePlayers) {
    const position = normalizeDraftPosition(player.positie);
    if (position) {
      actualPositionCounts[position] += 1;
    }
  }

  if (!hasViableFormationForCounts(actualPositionCounts, input.formationOptions, input.benchComposition)) {
    throw new Error("spelercombinatie past niet binnen de beschikbare formatie-opties");
  }
}

export function registerPick(input: {
  teamId: string;
  playerId: string;
  at?: string;
  scope?: DraftScope;
  playerCatalog?: DraftPickValidationPlayer[];
  budgetCap?: number;
  formationOptions?: string[];
  benchComposition?: DraftBenchComposition;
}): DraftState {
  const scope = input.scope ?? "eredivisie";
  const current = readDraftState(scope);
  const next = buildRegisteredPickState(current, input);

  const rosterState = addPlayerToTeamRoster(input.teamId, input.playerId, scope);
  syncDraftRosterToManagerTeam({
    teamId: input.teamId,
    playerIds: rosterState.byTeamId[input.teamId] ?? [],
    scope,
    playerCatalog: input.playerCatalog,
  });

  return writeDraftState(next, scope);
}

function buildRegisteredPickState(
  current: DraftState,
  input: {
    teamId: string;
    playerId: string;
    at?: string;
    playerCatalog?: DraftPickValidationPlayer[];
    budgetCap?: number;
    formationOptions?: string[];
    benchComposition?: DraftBenchComposition;
  },
): DraftState {
  if (current.status !== "ACTIVE") {
    throw new Error("draft is not active");
  }
  if (current.currentTurnTeamId !== input.teamId) {
    throw new Error("not this team's turn");
  }
  if (current.picks.some((pick) => pick.playerId === input.playerId)) {
    const existingPick = current.picks.find((pick) => pick.playerId === input.playerId)!;
    throw new Error("Speler is al in een ander team: " + existingPick.teamId);
  }

  validateDraftPickConstraints({
    current,
    teamId: input.teamId,
    playerId: input.playerId,
    playerCatalog: input.playerCatalog,
    budgetCap: input.budgetCap,
    formationOptions: input.formationOptions,
    benchComposition: input.benchComposition,
  });

  const pickNumber = current.picks.length + 1;
  const at = input.at ?? new Date().toISOString();
  const nextPicks = [...current.picks, { pickNumber, teamId: input.teamId, playerId: input.playerId, pickedAt: at }];
  const status: DraftStatus = nextPicks.length >= current.totalPicks ? "COMPLETED" : "ACTIVE";

  return {
    ...current,
    status,
    picks: nextPicks,
    currentTurnTeamId: status === "COMPLETED" ? null : computeCurrentTurnTeamId(current.pickSequence, nextPicks.length),
    events: [
      ...current.events,
      { type: "PLAYER_PICKED", at, actorId: input.teamId, payload: { pickNumber, playerId: input.playerId } },
    ],
  };
}

export async function registerPickPersistent(input: {
  teamId: string;
  playerId: string;
  at?: string;
  scope?: DraftScope;
  playerCatalog?: DraftPickValidationPlayer[];
  budgetCap?: number;
  formationOptions?: string[];
  benchComposition?: DraftBenchComposition;
}): Promise<DraftState> {
  const scope = input.scope ?? "eredivisie";
  const current = await readDraftStatePersistent(scope);
  const next = buildRegisteredPickState(current, input);

  const rosterState = await addPlayerToTeamRosterPersistent(input.teamId, input.playerId, scope);
  await syncDraftRosterToManagerTeamPersistent({
    teamId: input.teamId,
    playerIds: rosterState.byTeamId[input.teamId] ?? [],
    scope,
    playerCatalog: input.playerCatalog,
  });

  return writeDraftStatePersistent(next, scope);
}

export function returnPickedPlayerToPool(input: {
  teamId: string;
  playerId: string;
  reason: string;
  at?: string;
  scope?: DraftScope;
}): DraftState {
  const scope = input.scope ?? "eredivisie";
  const current = readDraftState(scope);
  const next = buildReturnedPickState(current, input);

  const rosterState = removePlayerFromTeamRoster(input.teamId, input.playerId, scope);
  syncDraftRosterToManagerTeam({
    teamId: input.teamId,
    playerIds: rosterState.byTeamId[input.teamId] ?? [],
    scope,
  });

  return writeDraftState(next, scope);
}

function buildReturnedPickState(
  current: DraftState,
  input: {
    teamId: string;
    playerId: string;
    reason: string;
    at?: string;
  },
): DraftState {
  const pickIndex = current.picks.findIndex((pick) => pick.teamId === input.teamId && pick.playerId === input.playerId);

  if (pickIndex === -1) {
    throw new Error("pick not found");
  }

  const at = input.at ?? new Date().toISOString();
  const nextPicks = current.picks
    .filter((_, idx) => idx !== pickIndex)
    .map((pick, idx) => ({ ...pick, pickNumber: idx + 1 }));

  return {
    ...current,
    status: "ACTIVE",
    picks: nextPicks,
    currentTurnTeamId: computeCurrentTurnTeamId(current.pickSequence, nextPicks.length),
    events: [
      ...current.events,
      {
        type: "PLAYER_RETURNED",
        at,
        actorId: input.teamId,
        payload: { playerId: input.playerId, reason: input.reason },
      },
    ],
  };
}

export async function returnPickedPlayerToPoolPersistent(input: {
  teamId: string;
  playerId: string;
  reason: string;
  at?: string;
  scope?: DraftScope;
}): Promise<DraftState> {
  const scope = input.scope ?? "eredivisie";
  const current = await readDraftStatePersistent(scope);
  const next = buildReturnedPickState(current, input);

  const rosterState = await removePlayerFromTeamRosterPersistent(input.teamId, input.playerId, scope);
  await syncDraftRosterToManagerTeamPersistent({
    teamId: input.teamId,
    playerIds: rosterState.byTeamId[input.teamId] ?? [],
    scope,
  });

  return writeDraftStatePersistent(next, scope);
}

export function resetDraftStateForTests(scope: DraftScope = "eredivisie") {
  writeDraftState({ ...DEFAULT_DRAFT_STATE }, scope);
}

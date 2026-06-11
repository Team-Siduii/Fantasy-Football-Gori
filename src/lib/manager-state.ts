import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { isGoriDatabaseEnabled, readPersistentJson, writePersistentJson } from "./persistent-json-store";
import { AUTH_TEST_ACCOUNT_PRESETS } from "./auth-test-accounts";
import { getAuthAccountByEmail, getAuthAccountById, listManagerAccounts } from "./auth-store";
import { getLeagueAdminConfig, type LeagueMode } from "./league-admin-config";

export type RoundLock = {
  roundNumber: number;
  locked: boolean;
  reason: string;
  updatedBy: string;
  updatedAt: string;
};

export type AdminActionLogEntry = {
  actionType: "ROUND_LOCKED" | "ROUND_UNLOCKED";
  targetType: "ROUND";
  targetId: string;
  actorId: string;
  reason: string;
  createdAt: string;
};

export type ManagerStateScope = "eredivisie" | "wk";

export type RoundSnapshot = {
  formation: string;
  lineupIds: string[];
  benchIds: string[];
  pickedTransferId: string | null;
  pendingSellId: string | null;
  pendingBuyId: string | null;
};

type ManagerPersonalState = RoundSnapshot & {
  roundStates: Record<string, RoundSnapshot>;
};

export type ManagerState = {
  formation: string;
  lineupIds: string[];
  benchIds: string[];
  pickedTransferId: string | null;
  pendingSellId: string | null;
  pendingBuyId: string | null;
  roundStates: Record<string, RoundSnapshot>;
  managerStates: Record<string, ManagerPersonalState>;
  roundLocks: RoundLock[];
  adminActionLog: AdminActionLogEntry[];
};

const DEFAULT_SNAPSHOT: RoundSnapshot = {
  formation: "4-3-3",
  lineupIds: [],
  benchIds: [],
  pickedTransferId: null,
  pendingSellId: null,
  pendingBuyId: null,
};

const DEFAULT_STATE: ManagerState = {
  ...DEFAULT_SNAPSHOT,
  roundStates: {},
  managerStates: {},
  roundLocks: [],
  adminActionLog: [],
};

function toRoundSnapshot(input: Partial<RoundSnapshot>): RoundSnapshot {
  return {
    formation: typeof input.formation === "string" ? input.formation : DEFAULT_SNAPSHOT.formation,
    lineupIds: Array.isArray(input.lineupIds) ? input.lineupIds.filter((id): id is string => typeof id === "string") : [],
    benchIds: Array.isArray(input.benchIds) ? input.benchIds.filter((id): id is string => typeof id === "string") : [],
    pickedTransferId: typeof input.pickedTransferId === "string" ? input.pickedTransferId : null,
    pendingSellId: typeof input.pendingSellId === "string" ? input.pendingSellId : null,
    pendingBuyId:
      typeof input.pendingBuyId === "string"
        ? input.pendingBuyId
        : typeof input.pickedTransferId === "string"
          ? input.pickedTransferId
          : null,
  };
}

function toPersonalState(input: Partial<ManagerPersonalState>): ManagerPersonalState {
  return {
    ...toRoundSnapshot(input),
    roundStates: normalizeRoundStates(input.roundStates),
  };
}

export function resolveManagerStatePath(scope: ManagerStateScope = "eredivisie") {
  if (scope === "wk" && process.env.MANAGER_STATE_WK_PATH) {
    return process.env.MANAGER_STATE_WK_PATH;
  }

  if (scope === "eredivisie" && process.env.MANAGER_STATE_PATH) {
    return process.env.MANAGER_STATE_PATH;
  }

  if (process.env.VERCEL) {
    return scope === "wk" ? "/tmp/manager-state-wk.json" : "/tmp/manager-state.json";
  }

  const suffix = scope === "wk" ? "-wk" : "";
  return path.join(process.cwd(), "data", `manager-state${suffix}.json`);
}

function normalizeRoundLocks(input: unknown): RoundLock[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((entry): entry is RoundLock => {
      return (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as RoundLock).roundNumber === "number" &&
        Number.isInteger((entry as RoundLock).roundNumber) &&
        typeof (entry as RoundLock).locked === "boolean" &&
        typeof (entry as RoundLock).reason === "string" &&
        typeof (entry as RoundLock).updatedBy === "string" &&
        typeof (entry as RoundLock).updatedAt === "string"
      );
    })
    .sort((a, b) => a.roundNumber - b.roundNumber);
}

function normalizeAdminActionLog(input: unknown): AdminActionLogEntry[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.filter((entry): entry is AdminActionLogEntry => {
    return (
      typeof entry === "object" &&
      entry !== null &&
      ((entry as AdminActionLogEntry).actionType === "ROUND_LOCKED" ||
        (entry as AdminActionLogEntry).actionType === "ROUND_UNLOCKED") &&
      (entry as AdminActionLogEntry).targetType === "ROUND" &&
      typeof (entry as AdminActionLogEntry).targetId === "string" &&
      typeof (entry as AdminActionLogEntry).actorId === "string" &&
      typeof (entry as AdminActionLogEntry).reason === "string" &&
      typeof (entry as AdminActionLogEntry).createdAt === "string"
    );
  });
}

function normalizeRoundStates(input: unknown): Record<string, RoundSnapshot> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const normalized: Record<string, RoundSnapshot> = {};
  for (const [roundKey, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!/^\d+$/.test(roundKey) || !raw || typeof raw !== "object") {
      continue;
    }

    normalized[roundKey] = toRoundSnapshot(raw as Partial<RoundSnapshot>);
  }

  return normalized;
}

function mergePersonalState(current: ManagerPersonalState | undefined, incoming: ManagerPersonalState): ManagerPersonalState {
  if (!current) {
    return incoming;
  }

  const currentScore = current.lineupIds.length + current.benchIds.length + Object.keys(current.roundStates).length * 10;
  const incomingScore = incoming.lineupIds.length + incoming.benchIds.length + Object.keys(incoming.roundStates).length * 10;
  const preferred = incomingScore >= currentScore ? incoming : current;

  return {
    ...current,
    ...incoming,
    ...preferred,
    roundStates: {
      ...current.roundStates,
      ...incoming.roundStates,
    },
  };
}

type CanonicalManagerIdentity = {
  canonicalKey: string;
  aliases: Set<string>;
};

function normalizeAliasValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function addAlias(target: Set<string>, value?: string | null) {
  if (typeof value !== "string") {
    return;
  }

  const normalized = normalizeAliasValue(value);
  if (normalized) {
    target.add(normalized);
  }
}

function buildCanonicalManagerIdentities(scope: ManagerStateScope): CanonicalManagerIdentity[] {
  const byCanonical = new Map<string, CanonicalManagerIdentity>();
  const ensure = (managerId: string) => {
    const canonicalKey = normalizeAliasValue(managerId);
    const existing = byCanonical.get(canonicalKey);
    if (existing) {
      return existing;
    }

    const created: CanonicalManagerIdentity = {
      canonicalKey,
      aliases: new Set<string>([canonicalKey]),
    };
    byCanonical.set(canonicalKey, created);
    return created;
  };

  for (const preset of AUTH_TEST_ACCOUNT_PRESETS.filter((candidate) => candidate.role === "manager")) {
    const identity = ensure(preset.id);
    addAlias(identity.aliases, preset.id);
    addAlias(identity.aliases, preset.label);
    addAlias(identity.aliases, preset.name);
    addAlias(identity.aliases, preset.teamName);
    addAlias(identity.aliases, preset.email);
  }

  for (const account of listManagerAccounts()) {
    const identity = ensure(account.id);
    addAlias(identity.aliases, account.id);
    addAlias(identity.aliases, account.profile.name);
    addAlias(identity.aliases, account.profile.teamName);
    addAlias(identity.aliases, account.profile.email);
  }

  const config = getLeagueAdminConfig(scope as LeagueMode);
  for (const participant of config.participants) {
    const identity = ensure(participant.managerId);
    addAlias(identity.aliases, participant.managerId);
    addAlias(identity.aliases, participant.label);
    addAlias(identity.aliases, participant.email);
  }

  return Array.from(byCanonical.values());
}

function resolveCanonicalManagerKey(scope: ManagerStateScope, managerKey?: string | null): string | null {
  if (!managerKey) {
    return null;
  }

  const normalized = normalizeAliasValue(managerKey);
  if (!normalized) {
    return null;
  }

  const directAuthAccount = getAuthAccountById(normalized);
  if (directAuthAccount?.role === "manager") {
    return normalizeAliasValue(directAuthAccount.id);
  }

  const directParticipant = getLeagueAdminConfig(scope as LeagueMode).participants.find(
    (participant) => normalizeAliasValue(participant.managerId) === normalized,
  );
  if (directParticipant) {
    return normalizeAliasValue(directParticipant.managerId);
  }

  const directAuthEmail = getAuthAccountByEmail(normalized);
  if (directAuthEmail?.role === "manager") {
    return normalizeAliasValue(directAuthEmail.id);
  }

  const identities = buildCanonicalManagerIdentities(scope);
  const matched = identities.find((identity) => identity.aliases.has(normalized));
  return matched?.canonicalKey ?? normalized;
}

function normalizeManagerStates(
  input: unknown,
  scope: ManagerStateScope = "eredivisie",
): Record<string, ManagerPersonalState> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const normalized: Record<string, ManagerPersonalState> = {};
  for (const [managerKey, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!managerKey || !raw || typeof raw !== "object") {
      continue;
    }

    const canonicalKey = resolveCanonicalManagerKey(scope, managerKey) ?? normalizeAliasValue(managerKey);
    const nextState = toPersonalState(raw as Partial<ManagerPersonalState>);
    normalized[canonicalKey] = mergePersonalState(normalized[canonicalKey], nextState);
  }

  return normalized;
}

function normalizeManagerKey(scope: ManagerStateScope = "eredivisie", managerKey?: string | null): string | null {
  if (!managerKey) {
    return null;
  }

  return resolveCanonicalManagerKey(scope, managerKey);
}

function resolvePersonalState(
  state: ManagerState,
  scope: ManagerStateScope = "eredivisie",
  managerKey?: string | null,
): ManagerPersonalState {
  const key = normalizeManagerKey(scope, managerKey);
  if (key && state.managerStates[key]) {
    return state.managerStates[key];
  }

  // Backward-compatible fallback for legacy single-manager state files.
  return {
    ...toRoundSnapshot(state),
    roundStates: normalizeRoundStates(state.roundStates),
  };
}

export function readManagerState(scope: ManagerStateScope = "eredivisie", managerKey?: string | null): ManagerState {
  const target = resolveManagerStatePath(scope);

  if (!existsSync(target)) {
    return { ...DEFAULT_STATE };
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as Partial<ManagerState> & {
      roundStates?: unknown;
      managerStates?: unknown;
    };

    const state: ManagerState = {
      ...DEFAULT_STATE,
      formation: typeof parsed.formation === "string" ? parsed.formation : DEFAULT_STATE.formation,
      lineupIds: Array.isArray(parsed.lineupIds) ? parsed.lineupIds.filter((id): id is string => typeof id === "string") : [],
      benchIds: Array.isArray(parsed.benchIds) ? parsed.benchIds.filter((id): id is string => typeof id === "string") : [],
      pickedTransferId: typeof parsed.pickedTransferId === "string" ? parsed.pickedTransferId : null,
      pendingSellId: typeof parsed.pendingSellId === "string" ? parsed.pendingSellId : null,
      pendingBuyId:
        typeof parsed.pendingBuyId === "string"
          ? parsed.pendingBuyId
          : typeof parsed.pickedTransferId === "string"
            ? parsed.pickedTransferId
            : null,
      roundStates: normalizeRoundStates(parsed.roundStates),
      managerStates: normalizeManagerStates(parsed.managerStates, scope),
      roundLocks: normalizeRoundLocks(parsed.roundLocks),
      adminActionLog: normalizeAdminActionLog(parsed.adminActionLog),
    };

    const personal = resolvePersonalState(state, scope, managerKey);

    return {
      ...state,
      formation: personal.formation,
      lineupIds: personal.lineupIds,
      benchIds: personal.benchIds,
      pickedTransferId: personal.pickedTransferId,
      pendingSellId: personal.pendingSellId,
      pendingBuyId: personal.pendingBuyId,
      roundStates: personal.roundStates,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveManagerState(
  nextState: Partial<ManagerState>,
  scope: ManagerStateScope = "eredivisie",
  managerKey?: string | null,
): ManagerState {
  const current = readManagerState(scope);
  const toWrite = buildNextManagerState(current, nextState, scope, managerKey);
  writeManagerStateFile(toWrite, scope);
  const key = normalizeManagerKey(scope, managerKey);
  return key ? readManagerState(scope, key) : toWrite;
}

function buildNextManagerState(
  current: ManagerState,
  nextState: Partial<ManagerState>,
  scope: ManagerStateScope = "eredivisie",
  managerKey?: string | null,
): ManagerState {
  const key = normalizeManagerKey(scope, managerKey);
  const currentPersonal = resolvePersonalState(current, scope, key);

  const nextPersonal: ManagerPersonalState = {
    ...currentPersonal,
    ...toRoundSnapshot(nextState),
    roundStates: nextState.roundStates ? normalizeRoundStates(nextState.roundStates) : currentPersonal.roundStates,
  };

  const mergedManagerStates = { ...current.managerStates };
  if (key) {
    mergedManagerStates[key] = nextPersonal;
  }

  const merged: ManagerState = {
    ...current,
    ...nextState,
    formation: nextPersonal.formation,
    lineupIds: nextPersonal.lineupIds,
    benchIds: nextPersonal.benchIds,
    pickedTransferId: nextPersonal.pickedTransferId,
    pendingSellId: nextPersonal.pendingSellId,
    pendingBuyId: nextPersonal.pendingBuyId,
    roundStates: nextPersonal.roundStates,
    managerStates: mergedManagerStates,
    roundLocks: Array.isArray(nextState.roundLocks) ? normalizeRoundLocks(nextState.roundLocks) : current.roundLocks,
    adminActionLog: Array.isArray(nextState.adminActionLog)
      ? normalizeAdminActionLog(nextState.adminActionLog)
      : current.adminActionLog,
  };

  return {
    ...merged,
    formation: nextPersonal.formation,
    lineupIds: nextPersonal.lineupIds,
    benchIds: nextPersonal.benchIds,
    pickedTransferId: nextPersonal.pickedTransferId,
    pendingSellId: nextPersonal.pendingSellId,
    pendingBuyId: nextPersonal.pendingBuyId,
    roundStates: nextPersonal.roundStates,
  };
}

function writeManagerStateFile(next: ManagerState, scope: ManagerStateScope = "eredivisie") {
  const target = resolveManagerStatePath(scope);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(next, null, 2), "utf-8");
}

export async function readManagerStatePersistent(
  scope: ManagerStateScope = "eredivisie",
  managerKey?: string | null,
): Promise<ManagerState> {
  const fallback = readManagerState(scope, managerKey);
  if (!isGoriDatabaseEnabled()) {
    return fallback;
  }

  const persisted = await readPersistentJson({ store: "manager-state", scope }, readManagerState(scope));
  writeManagerStateFile(persisted, scope);
  return readManagerState(scope, managerKey);
}

export async function saveManagerStatePersistent(
  nextState: Partial<ManagerState>,
  scope: ManagerStateScope = "eredivisie",
  managerKey?: string | null,
): Promise<ManagerState> {
  const current = await readManagerStatePersistent(scope);
  const toWrite = buildNextManagerState(current, nextState, scope, managerKey);
  writeManagerStateFile(toWrite, scope);
  if (isGoriDatabaseEnabled()) {
    await writePersistentJson({ store: "manager-state", scope }, toWrite);
  }
  const key = normalizeManagerKey(scope, managerKey);
  return key ? readManagerState(scope, key) : toWrite;
}

export function readManagerStateForRound(
  roundNumber: number,
  scope: ManagerStateScope = "eredivisie",
  managerKey?: string | null,
): RoundSnapshot {
  const state = readManagerState(scope, managerKey);
  return pickRoundSnapshot(state, roundNumber);
}

function pickRoundSnapshot(state: ManagerState, roundNumber: number): RoundSnapshot {
  const entries = Object.entries(state.roundStates)
    .map(([key, snapshot]) => ({ round: Number(key), snapshot }))
    .filter((entry) => Number.isInteger(entry.round) && entry.round > 0 && entry.round <= roundNumber)
    .sort((a, b) => b.round - a.round);

  if (entries.length > 0) {
    return entries[0].snapshot;
  }

  return toRoundSnapshot(state);
}

export async function readManagerStateForRoundPersistent(
  roundNumber: number,
  scope: ManagerStateScope = "eredivisie",
  managerKey?: string | null,
): Promise<RoundSnapshot> {
  const state = await readManagerStatePersistent(scope, managerKey);
  return pickRoundSnapshot(state, roundNumber);
}

export function saveManagerStateForRound(
  roundNumber: number,
  nextState: Partial<ManagerState>,
  scope: ManagerStateScope = "eredivisie",
  propagateToFutureRounds = true,
  managerKey?: string | null,
): ManagerState {
  const state = readManagerState(scope, managerKey);
  const snapshot = toRoundSnapshot({ ...state, ...nextState });
  const nextRoundStates = buildNextRoundStates(state.roundStates, roundNumber, snapshot, propagateToFutureRounds);

  return saveManagerState(
    {
      ...nextState,
      ...snapshot,
      roundStates: nextRoundStates,
    },
    scope,
    managerKey,
  );
}

function buildNextRoundStates(
  currentRoundStates: Record<string, RoundSnapshot>,
  roundNumber: number,
  snapshot: RoundSnapshot,
  propagateToFutureRounds: boolean,
) {
  const roundKey = String(roundNumber);
  const nextRoundStates: Record<string, RoundSnapshot> = { ...currentRoundStates, [roundKey]: snapshot };

  if (propagateToFutureRounds) {
    for (const key of Object.keys(nextRoundStates)) {
      const existingRound = Number(key);
      if (Number.isInteger(existingRound) && existingRound > roundNumber) {
        nextRoundStates[key] = snapshot;
      }
    }
  }

  return nextRoundStates;
}

export async function saveManagerStateForRoundPersistent(
  roundNumber: number,
  nextState: Partial<ManagerState>,
  scope: ManagerStateScope = "eredivisie",
  propagateToFutureRounds = true,
  managerKey?: string | null,
): Promise<ManagerState> {
  const state = await readManagerStatePersistent(scope, managerKey);
  const snapshot = toRoundSnapshot({ ...state, ...nextState });
  const nextRoundStates = buildNextRoundStates(state.roundStates, roundNumber, snapshot, propagateToFutureRounds);

  return saveManagerStatePersistent(
    {
      ...nextState,
      ...snapshot,
      roundStates: nextRoundStates,
    },
    scope,
    managerKey,
  );
}

export function isRoundLocked(roundNumber: number, scope: ManagerStateScope = "eredivisie"): boolean {
  const state = readManagerState(scope);
  return state.roundLocks.some((lock) => lock.roundNumber === roundNumber && lock.locked);
}

export async function isRoundLockedPersistent(roundNumber: number, scope: ManagerStateScope = "eredivisie"): Promise<boolean> {
  const state = await readManagerStatePersistent(scope);
  return state.roundLocks.some((lock) => lock.roundNumber === roundNumber && lock.locked);
}

export function setRoundLock(
  input: {
    roundNumber: number;
    locked: boolean;
    reason: string;
    actorId: string;
    at?: string;
  },
  scope: ManagerStateScope = "eredivisie",
): ManagerState {
  const state = readManagerState(scope);
  return saveRoundLockToState(state, input, scope);
}

function buildRoundLockPatch(
  state: ManagerState,
  input: {
    roundNumber: number;
    locked: boolean;
    reason: string;
    actorId: string;
    at?: string;
  },
) {
  const now = input.at ?? new Date().toISOString();

  const nextLock: RoundLock = {
    roundNumber: input.roundNumber,
    locked: input.locked,
    reason: input.reason,
    updatedBy: input.actorId,
    updatedAt: now,
  };

  const nextLocks = state.roundLocks.filter((lock) => lock.roundNumber !== input.roundNumber);
  nextLocks.push(nextLock);
  nextLocks.sort((a, b) => a.roundNumber - b.roundNumber);

  const nextLog: AdminActionLogEntry[] = [
    ...state.adminActionLog,
    {
      actionType: input.locked ? "ROUND_LOCKED" : "ROUND_UNLOCKED",
      targetType: "ROUND",
      targetId: String(input.roundNumber),
      actorId: input.actorId,
      reason: input.reason,
      createdAt: now,
    },
  ];

  return { roundLocks: nextLocks, adminActionLog: nextLog };
}

function saveRoundLockToState(
  state: ManagerState,
  input: {
    roundNumber: number;
    locked: boolean;
    reason: string;
    actorId: string;
    at?: string;
  },
  scope: ManagerStateScope,
) {
  return saveManagerState(buildRoundLockPatch(state, input), scope);
}

export async function setRoundLockPersistent(
  input: {
    roundNumber: number;
    locked: boolean;
    reason: string;
    actorId: string;
    at?: string;
  },
  scope: ManagerStateScope = "eredivisie",
): Promise<ManagerState> {
  const state = await readManagerStatePersistent(scope);
  return saveManagerStatePersistent(buildRoundLockPatch(state, input), scope);
}

export function resetManagerStateForTests(scope: ManagerStateScope = "eredivisie") {
  const target = resolveManagerStatePath(scope);
  if (existsSync(target)) {
    writeFileSync(target, JSON.stringify(DEFAULT_STATE, null, 2), "utf-8");
  }
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

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

export type ManagerState = {
  formation: string;
  lineupIds: string[];
  benchIds: string[];
  pickedTransferId: string | null;
  pendingSellId: string | null;
  pendingBuyId: string | null;
  roundStates: Record<string, RoundSnapshot>;
  roundLocks: RoundLock[];
  adminActionLog: AdminActionLogEntry[];
};

const DEFAULT_STATE: ManagerState = {
  formation: "4-3-3",
  lineupIds: [],
  benchIds: [],
  pickedTransferId: null,
  pendingSellId: null,
  pendingBuyId: null,
  roundStates: {},
  roundLocks: [],
  adminActionLog: [],
};

function toRoundSnapshot(input: Partial<ManagerState>): RoundSnapshot {
  return {
    formation: typeof input.formation === "string" ? input.formation : DEFAULT_STATE.formation,
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

export function resolveManagerStatePath(scope: ManagerStateScope = "eredivisie") {
  if (scope === "wk" && process.env.MANAGER_STATE_WK_PATH) {
    return process.env.MANAGER_STATE_WK_PATH;
  }

  if (scope === "eredivisie" && process.env.MANAGER_STATE_PATH) {
    return process.env.MANAGER_STATE_PATH;
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

    normalized[roundKey] = toRoundSnapshot(raw as Partial<ManagerState>);
  }

  return normalized;
}

export function readManagerState(scope: ManagerStateScope = "eredivisie"): ManagerState {
  const target = resolveManagerStatePath(scope);

  if (!existsSync(target)) {
    return { ...DEFAULT_STATE };
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as Partial<ManagerState> & { roundStates?: unknown };
    return {
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
      roundLocks: normalizeRoundLocks(parsed.roundLocks),
      adminActionLog: normalizeAdminActionLog(parsed.adminActionLog),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveManagerState(nextState: Partial<ManagerState>, scope: ManagerStateScope = "eredivisie"): ManagerState {
  const target = resolveManagerStatePath(scope);
  mkdirSync(path.dirname(target), { recursive: true });

  const current = readManagerState(scope);
  const merged: ManagerState = {
    ...current,
    ...nextState,
    lineupIds: Array.isArray(nextState.lineupIds)
      ? nextState.lineupIds.filter((id): id is string => typeof id === "string")
      : current.lineupIds,
    benchIds: Array.isArray(nextState.benchIds)
      ? nextState.benchIds.filter((id): id is string => typeof id === "string")
      : current.benchIds,
    roundStates: nextState.roundStates ? normalizeRoundStates(nextState.roundStates) : current.roundStates,
    roundLocks: Array.isArray(nextState.roundLocks) ? normalizeRoundLocks(nextState.roundLocks) : current.roundLocks,
    adminActionLog: Array.isArray(nextState.adminActionLog)
      ? normalizeAdminActionLog(nextState.adminActionLog)
      : current.adminActionLog,
  };

  writeFileSync(target, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

export function readManagerStateForRound(roundNumber: number, scope: ManagerStateScope = "eredivisie"): RoundSnapshot {
  const state = readManagerState(scope);
  const entries = Object.entries(state.roundStates)
    .map(([key, snapshot]) => ({ round: Number(key), snapshot }))
    .filter((entry) => Number.isInteger(entry.round) && entry.round > 0 && entry.round <= roundNumber)
    .sort((a, b) => b.round - a.round);

  if (entries.length > 0) {
    return entries[0].snapshot;
  }

  return toRoundSnapshot(state);
}

export function saveManagerStateForRound(
  roundNumber: number,
  nextState: Partial<ManagerState>,
  scope: ManagerStateScope = "eredivisie",
  propagateToFutureRounds = true,
): ManagerState {
  const state = readManagerState(scope);
  const snapshot = toRoundSnapshot({ ...state, ...nextState });
  const roundKey = String(roundNumber);
  const nextRoundStates: Record<string, RoundSnapshot> = { ...state.roundStates, [roundKey]: snapshot };

  if (propagateToFutureRounds) {
    for (const key of Object.keys(nextRoundStates)) {
      const existingRound = Number(key);
      if (Number.isInteger(existingRound) && existingRound > roundNumber) {
        nextRoundStates[key] = snapshot;
      }
    }
  }

  return saveManagerState(
    {
      ...nextState,
      ...snapshot,
      roundStates: nextRoundStates,
    },
    scope,
  );
}

export function isRoundLocked(roundNumber: number, scope: ManagerStateScope = "eredivisie"): boolean {
  const state = readManagerState(scope);
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

  return saveManagerState(
    {
      roundLocks: nextLocks,
      adminActionLog: nextLog,
    },
    scope,
  );
}

export function resetManagerStateForTests(scope: ManagerStateScope = "eredivisie") {
  const target = resolveManagerStatePath(scope);
  if (existsSync(target)) {
    writeFileSync(target, JSON.stringify(DEFAULT_STATE, null, 2), "utf-8");
  }
}

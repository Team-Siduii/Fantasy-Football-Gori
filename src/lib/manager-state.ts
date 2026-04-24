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

export type ManagerState = {
  formation: string;
  lineupIds: string[];
  benchIds: string[];
  pickedTransferId: string | null;
  pendingSellId: string | null;
  pendingBuyId: string | null;
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
  roundLocks: [],
  adminActionLog: [],
};

function getStatePath() {
  if (process.env.MANAGER_STATE_PATH) {
    return process.env.MANAGER_STATE_PATH;
  }

  return path.join(process.cwd(), "data", "manager-state.json");
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

export function readManagerState(): ManagerState {
  const target = getStatePath();

  if (!existsSync(target)) {
    return { ...DEFAULT_STATE };
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as Partial<ManagerState>;
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
      roundLocks: normalizeRoundLocks(parsed.roundLocks),
      adminActionLog: normalizeAdminActionLog(parsed.adminActionLog),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveManagerState(nextState: Partial<ManagerState>): ManagerState {
  const target = getStatePath();
  mkdirSync(path.dirname(target), { recursive: true });

  const current = readManagerState();
  const merged: ManagerState = {
    ...current,
    ...nextState,
    lineupIds: Array.isArray(nextState.lineupIds)
      ? nextState.lineupIds.filter((id): id is string => typeof id === "string")
      : current.lineupIds,
    benchIds: Array.isArray(nextState.benchIds)
      ? nextState.benchIds.filter((id): id is string => typeof id === "string")
      : current.benchIds,
    roundLocks: Array.isArray(nextState.roundLocks) ? normalizeRoundLocks(nextState.roundLocks) : current.roundLocks,
    adminActionLog: Array.isArray(nextState.adminActionLog)
      ? normalizeAdminActionLog(nextState.adminActionLog)
      : current.adminActionLog,
  };

  writeFileSync(target, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

export function isRoundLocked(roundNumber: number): boolean {
  const state = readManagerState();
  return state.roundLocks.some((lock) => lock.roundNumber === roundNumber && lock.locked);
}

export function setRoundLock(input: {
  roundNumber: number;
  locked: boolean;
  reason: string;
  actorId: string;
  at?: string;
}): ManagerState {
  const state = readManagerState();
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

  return saveManagerState({
    roundLocks: nextLocks,
    adminActionLog: nextLog,
  });
}

export function resetManagerStateForTests() {
  const target = getStatePath();
  if (existsSync(target)) {
    writeFileSync(target, JSON.stringify(DEFAULT_STATE, null, 2), "utf-8");
  }
}

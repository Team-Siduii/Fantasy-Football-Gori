import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export type ManagerState = {
  formation: string;
  lineupIds: string[];
  benchIds: string[];
  pickedTransferId: string | null;
};

const DEFAULT_STATE: ManagerState = {
  formation: "4-3-3",
  lineupIds: [],
  benchIds: [],
  pickedTransferId: null,
};

function getStatePath() {
  if (process.env.MANAGER_STATE_PATH) {
    return process.env.MANAGER_STATE_PATH;
  }

  return path.join(process.cwd(), "data", "manager-state.json");
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
  };

  writeFileSync(target, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

export function resetManagerStateForTests() {
  const target = getStatePath();
  if (existsSync(target)) {
    writeFileSync(target, JSON.stringify(DEFAULT_STATE, null, 2), "utf-8");
  }
}

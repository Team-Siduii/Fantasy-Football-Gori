export type ZoneName = "lineup" | "bench";

export type ZoneState<T> = {
  lineup: T[];
  bench: T[];
};

type ReorderInput = {
  sourceZone: ZoneName;
  sourceIndex: number;
  targetZone: ZoneName;
  targetIndex: number;
};

function inBounds(index: number, length: number) {
  return index >= 0 && index < length;
}

export function reorderAcrossZones<T>(state: ZoneState<T>, input: ReorderInput): ZoneState<T> {
  const sourceList = state[input.sourceZone];
  const targetList = state[input.targetZone];

  if (!inBounds(input.sourceIndex, sourceList.length) || !inBounds(input.targetIndex, targetList.length)) {
    return state;
  }

  if (input.sourceZone === input.targetZone) {
    const next = [...sourceList];
    const [moved] = next.splice(input.sourceIndex, 1);
    next.splice(input.targetIndex, 0, moved);

    return input.sourceZone === "lineup"
      ? { lineup: next, bench: [...state.bench] }
      : { lineup: [...state.lineup], bench: next };
  }

  const nextSource = [...sourceList];
  const nextTarget = [...targetList];
  const sourceItem = nextSource[input.sourceIndex];
  const targetItem = nextTarget[input.targetIndex];

  nextSource[input.sourceIndex] = targetItem;
  nextTarget[input.targetIndex] = sourceItem;

  if (input.sourceZone === "lineup") {
    return { lineup: nextSource, bench: nextTarget };
  }

  return { lineup: nextTarget, bench: nextSource };
}

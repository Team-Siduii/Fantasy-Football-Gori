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

type ReorderOptions<T> = {
  enforceLineupPosition?: boolean;
  getPosition?: (item: T) => string;
};

function inBounds(index: number, length: number) {
  return index >= 0 && index < length;
}

function canSwapByLineupPosition<T>(
  state: ZoneState<T>,
  input: ReorderInput,
  options: ReorderOptions<T>,
): boolean {
  if (!options.enforceLineupPosition || !options.getPosition) {
    return true;
  }

  if (input.sourceZone === "lineup" && input.targetZone === "lineup") {
    const fromPosition = options.getPosition(state.lineup[input.sourceIndex]);
    const toPosition = options.getPosition(state.lineup[input.targetIndex]);
    return fromPosition === toPosition;
  }

  if (input.sourceZone === "lineup") {
    const lineupPosition = options.getPosition(state.lineup[input.sourceIndex]);
    const benchPosition = options.getPosition(state.bench[input.targetIndex]);
    return lineupPosition === benchPosition;
  }

  if (input.targetZone === "lineup") {
    const benchPosition = options.getPosition(state.bench[input.sourceIndex]);
    const lineupPosition = options.getPosition(state.lineup[input.targetIndex]);
    return lineupPosition === benchPosition;
  }

  return true;
}

export function reorderAcrossZones<T>(state: ZoneState<T>, input: ReorderInput, options: ReorderOptions<T> = {}): ZoneState<T> {
  const sourceList = state[input.sourceZone];
  const targetList = state[input.targetZone];

  if (!inBounds(input.sourceIndex, sourceList.length) || !inBounds(input.targetIndex, targetList.length)) {
    return state;
  }

  if (!canSwapByLineupPosition(state, input, options)) {
    return state;
  }

  if (input.sourceZone === input.targetZone) {
    if (input.sourceZone === "lineup") {
      const next = [...state.lineup];
      const sourceItem = next[input.sourceIndex];
      const targetItem = next[input.targetIndex];
      next[input.sourceIndex] = targetItem;
      next[input.targetIndex] = sourceItem;

      return { lineup: next, bench: [...state.bench] };
    }

    const next = [...sourceList];
    const [moved] = next.splice(input.sourceIndex, 1);
    next.splice(input.targetIndex, 0, moved);

    return { lineup: [...state.lineup], bench: next };
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

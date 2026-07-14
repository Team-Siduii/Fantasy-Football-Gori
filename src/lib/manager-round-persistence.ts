export function canPersistManagerRoundState(input: {
  hydrated: boolean;
  suppressNextPersist: boolean;
  isRoundHydrating: boolean;
  lineupIds: string[];
  benchIds: string[];
  persistRound: number | null;
  hydratedRound: number | null;
}): boolean {
  if (!input.hydrated) {
    return false;
  }

  if (input.suppressNextPersist) {
    return false;
  }

  if (input.isRoundHydrating) {
    return false;
  }

  if (input.persistRound === null) {
    return false;
  }

  if (input.lineupIds.length === 0 && input.benchIds.length === 0) {
    return false;
  }

  return input.hydratedRound === input.persistRound;
}

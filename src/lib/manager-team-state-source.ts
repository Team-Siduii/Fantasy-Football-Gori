import { readManagerStateForRoundPersistent, readManagerStatePersistent, type ManagerStateScope, type RoundSnapshot } from "./manager-state";

export type TeamViewSnapshot = RoundSnapshot;

function normalizeRoundNumber(roundNumber?: number | null): number | null {
  if (!Number.isInteger(roundNumber) || (roundNumber ?? 0) <= 0) {
    return null;
  }
  return roundNumber as number;
}

export async function readTeamViewSnapshotPersistent(input: {
  scope: ManagerStateScope;
  managerEmail: string;
  roundNumber?: number | null;
}): Promise<TeamViewSnapshot> {
  const normalizedRound = normalizeRoundNumber(input.roundNumber);

  if (input.scope === "wk" && normalizedRound) {
    return readManagerStateForRoundPersistent(normalizedRound, input.scope, input.managerEmail);
  }

  return readManagerStatePersistent(input.scope, input.managerEmail);
}

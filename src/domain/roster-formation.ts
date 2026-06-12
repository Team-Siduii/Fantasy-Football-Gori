import { buildFormationSlots, getFormationOptions } from "./formation";

type Position = "GK" | "DEF" | "MID" | "FWD";

const BENCH_POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

function countPositions(positions: string[]) {
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const position of positions) {
    if (position === "GK" || position === "DEF" || position === "MID" || position === "FWD") {
      counts[position] += 1;
    }
  }
  return counts;
}

function getDeficitForFormation(availableCounts: Record<Position, number>, formation: string) {
  const requiredCounts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

  for (const position of buildFormationSlots(formation).flat()) {
    requiredCounts[position] += 1;
  }
  for (const position of BENCH_POSITIONS) {
    requiredCounts[position] += 1;
  }

  return (Object.keys(requiredCounts) as Position[]).reduce((sum, position) => {
    return sum + Math.max(0, requiredCounts[position] - availableCounts[position]);
  }, 0);
}

export function resolveCompatibleFormation(input: {
  preferredFormation: string;
  playerPositions: string[];
  vacancyCount?: number;
}) {
  const { preferredFormation, playerPositions, vacancyCount = 0 } = input;
  const availableCounts = countPositions(playerPositions);
  const candidates = [preferredFormation, ...getFormationOptions().filter((option) => option !== preferredFormation)];

  let bestFormation = preferredFormation;
  let bestDeficit = Number.POSITIVE_INFINITY;

  for (const formation of candidates) {
    const deficit = getDeficitForFormation(availableCounts, formation);
    if (deficit < bestDeficit) {
      bestDeficit = deficit;
      bestFormation = formation;
    }
    if (deficit <= vacancyCount) {
      return formation;
    }
  }

  return bestFormation;
}

import { buildFormationSlots, getFormationOptions } from "./formation";
import { calculateSquadCost } from "./team-budget";
import type { PlayerRecord } from "./player";

type Position = "GK" | "DEF" | "MID" | "FWD";

type BenchComposition = Record<Position, number>;

const BENCH_COMPOSITION: BenchComposition = { GK: 1, DEF: 1, MID: 1, FWD: 1 };

function normalizePosition(position: string): Position | null {
  const normalized = position.trim().toUpperCase();
  return normalized === "GK" || normalized === "DEF" || normalized === "MID" || normalized === "FWD" ? normalized : null;
}

function buildPositionCountsForFormation(formation: string, benchComposition: BenchComposition = BENCH_COMPOSITION): BenchComposition {
  const counts: BenchComposition = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const row of buildFormationSlots(formation)) {
    for (const slot of row) {
      counts[slot] += 1;
    }
  }
  for (const position of Object.keys(benchComposition) as Position[]) {
    counts[position] += benchComposition[position];
  }
  return counts;
}

function hasViableFormationForCounts(actualCounts: BenchComposition, formationOptions = getFormationOptions()) {
  return formationOptions.some((formation) => {
    const maxCounts = buildPositionCountsForFormation(formation);
    return (Object.keys(maxCounts) as Position[]).every((position) => actualCounts[position] <= maxCounts[position]);
  });
}

export function validateTransferSquad(input: {
  rosterPlayers: PlayerRecord[];
  incomingPlayer: PlayerRecord;
  soldPlayerId: string;
  budgetCap: number;
}) {
  const withoutSold = input.rosterPlayers.filter((player) => player.id !== input.soldPlayerId);
  const candidatePlayers = [...withoutSold, input.incomingPlayer];

  if (candidatePlayers.some((player) => player.id === input.incomingPlayer.id) && withoutSold.some((player) => player.id === input.incomingPlayer.id)) {
    throw new Error("deze speler zit al in je team");
  }

  if (calculateSquadCost(candidatePlayers) > input.budgetCap) {
    throw new Error(`Transfer geblokkeerd: team mag maximaal € ${input.budgetCap.toFixed(1)}M kosten.`);
  }

  const counts: BenchComposition = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const player of candidatePlayers) {
    const position = normalizePosition(player.positie);
    if (position) {
      counts[position] += 1;
    }
  }

  if (!hasViableFormationForCounts(counts)) {
    throw new Error(
      "Deze transfer is niet mogelijk: met deze spelers kun je geen geldige formatie " +
      "(4-3-3, 4-4-2, 3-5-2, 3-4-3 of 5-3-2) maken. Je hebt minimaal 2 keepers nodig, " +
      "en voldoende verdedigers, middenvelders en aanvallers voor een complete opstelling met 1 speler per positie op de bank.",
    );
  }

  return candidatePlayers;
}

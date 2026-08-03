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

function countPlayersByClub(players: PlayerRecord[]) {
  const counts = new Map<string, number>();
  for (const player of players) {
    const club = player.club.trim().toLowerCase();
    if (!club) continue;
    counts.set(club, (counts.get(club) ?? 0) + 1);
  }
  return counts;
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
  scope?: "eredivisie" | "wk";
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

  const scope = input.scope ?? "wk";

  if (scope === "eredivisie") {
    for (const count of countPlayersByClub(candidatePlayers).values()) {
      if (count > 1) {
        throw new Error("maximaal 1 speler per club toegestaan");
      }
    }
  } else {
    for (const count of countPlayersByClub(candidatePlayers).values()) {
      if (count > 2) {
        throw new Error("maximaal 2 spelers per land toegestaan");
      }
    }
  }

  const counts: BenchComposition = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const player of candidatePlayers) {
    const position = normalizePosition(player.positie);
    if (position) {
      counts[position] += 1;
    }
  }

  if (!hasViableFormationForCounts(counts)) {
    throw new Error("deze speler past niet in de gekozen formatie");
  }

  return candidatePlayers;
}

import { buildFormationSlots } from "../domain/formation";
import type { ZoneState } from "../domain/lineup-state";
import type { EnhancedPlayer } from "./player-derived";

type Position = "GK" | "DEF" | "MID" | "FWD";

const BENCH_POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

function createOpenSlot(position: Position, zone: "lineup" | "bench", index: number): EnhancedPlayer {
  return {
    id: `open-${zone}-${position}-${index}`,
    positie: position,
    naam: "Open slot",
    club: "Voeg speler toe",
    prijs: 0,
    punten: 0,
    roundPoints: 0,
    totalPoints: 0,
  };
}

export function hydrateSavedTeamState(input: {
  players: EnhancedPlayer[];
  formation: string;
  lineupIds: string[];
  benchIds: string[];
}): ZoneState<EnhancedPlayer> {
  const playerById = new Map(input.players.map((player) => [player.id, player]));
  const expectedLineupPositions = buildFormationSlots(input.formation).flat() as Position[];

  const lineup = expectedLineupPositions.map((position, index) => {
    const player = playerById.get(input.lineupIds[index] ?? "");
    return player ?? createOpenSlot(position, "lineup", index);
  });

  const bench = BENCH_POSITIONS.map((position, index) => {
    const player = playerById.get(input.benchIds[index] ?? "");
    return player ?? createOpenSlot(position, "bench", index);
  });

  return { lineup, bench };
}

import { buildFormationSlots } from "../domain/formation";
import type { EnhancedPlayer } from "./player-derived";

export type HydratedSquadState = {
  lineup: EnhancedPlayer[];
  bench: EnhancedPlayer[];
};

type HydrateSavedSquadInput = {
  players: EnhancedPlayer[];
  formation: string;
  lineupIds: string[];
  benchIds: string[];
  benchPositions: Array<"GK" | "DEF" | "MID" | "FWD">;
  resolveInactivePlayer?: (id: string) => EnhancedPlayer | null | undefined;
};

function createOpenSlot(position: "GK" | "DEF" | "MID" | "FWD"): EnhancedPlayer {
  return {
    id: `open-${position}-${Math.random().toString(36).slice(2, 8)}`,
    positie: position,
    naam: "Open slot",
    club: "Voeg speler toe",
    prijs: 0,
    punten: 0,
  };
}

function resolveSavedPlayers(
  ids: string[],
  byId: Map<string, EnhancedPlayer>,
  resolveInactivePlayer?: (id: string) => EnhancedPlayer | null | undefined,
): EnhancedPlayer[] {
  const resolved: EnhancedPlayer[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    const player = byId.get(id);
    if (player && !seen.has(player.id)) {
      seen.add(player.id);
      resolved.push(player);
      continue;
    }

    if (!player && !seen.has(id)) {
      const inactive = resolveInactivePlayer?.(id);
      if (inactive) {
        seen.add(id);
        resolved.push({
          ...inactive,
          punten: typeof inactive.punten === "number" ? inactive.punten : 0,
          inactive: true,
        });
      }
    }
  }

  return resolved;
}

function rebalanceSquadForFormation(
  lineupSlots: Array<"GK" | "DEF" | "MID" | "FWD">,
  savedLineup: EnhancedPlayer[],
  savedBench: EnhancedPlayer[],
) {
  const remaining = [...savedLineup, ...savedBench];
  const lineup = lineupSlots.map((position) => {
    const index = remaining.findIndex((player) => player.positie === position);
    if (index >= 0) {
      const [matched] = remaining.splice(index, 1);
      return matched;
    }
    return createOpenSlot(position);
  });

  return { lineup, remaining };
}

export function hydrateSavedSquadState(input: HydrateSavedSquadInput): HydratedSquadState {
  const byId = new Map(input.players.map((player) => [player.id, player]));
  const savedLineup = resolveSavedPlayers(input.lineupIds, byId, input.resolveInactivePlayer);
  const savedBench = resolveSavedPlayers(input.benchIds, byId, input.resolveInactivePlayer);

  const lineupSlots = buildFormationSlots(input.formation).flat() as Array<"GK" | "DEF" | "MID" | "FWD">;
  const { lineup, remaining } = rebalanceSquadForFormation(lineupSlots, savedLineup, savedBench);
  const bench = input.benchPositions.map((position, index) => remaining[index] ?? createOpenSlot(position));

  return { lineup, bench };
}

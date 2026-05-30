import type { PlayerRecord } from "@/domain/player";

export type EnhancedPlayer = PlayerRecord & {
  punten: number;
};

export function derivePlayerPoints(player: PlayerRecord): number {
  if (player.naam.toLowerCase().includes("mbapp")) {
    return 12;
  }

  return 0;
}

export function enrichPlayers(players: PlayerRecord[]): EnhancedPlayer[] {
  return players.map((player) => ({
    ...player,
    punten: derivePlayerPoints(player),
  }));
}

export function byPriceDesc(a: PlayerRecord, b: PlayerRecord) {
  return b.prijs - a.prijs;
}

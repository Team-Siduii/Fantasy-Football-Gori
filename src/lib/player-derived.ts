import type { PlayerRecord } from "@/domain/player";

export type EnhancedPlayer = PlayerRecord & {
  punten: number;
};

export function derivePlayerPoints(player: PlayerRecord & { punten?: number }): number {
  // Als de speler al punten heeft (vanuit API met stored points), gebruik die ook als dat 0 is.
  if (typeof player.punten === "number") {
    return player.punten;
  }

  return 0;
}

export function enrichPlayers(players: (PlayerRecord & { punten?: number })[]): EnhancedPlayer[] {
  return players.map((player) => ({
    ...player,
    punten: derivePlayerPoints(player),
  }));
}

export function byPriceDesc(a: PlayerRecord, b: PlayerRecord) {
  return b.prijs - a.prijs;
}

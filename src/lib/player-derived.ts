import type { PlayerRecord } from "@/domain/player";

export type EnhancedPlayer = PlayerRecord & {
  punten: number;
};

export function derivePlayerPoints(player: PlayerRecord & { punten?: number }): number {
  // Als de speler al punten heeft (vanuit API met stored points), gebruik die
  if (typeof player.punten === "number" && player.punten > 0) {
    return player.punten;
  }

  // Fallback: bekende spelers (tijdelijk, totdat punten sync actief is)
  const name = player.naam.toLowerCase();
  if (name.includes("mbapp")) return 12;

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

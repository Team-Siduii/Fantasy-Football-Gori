import type { PlayerRecord } from "@/domain/player";

export type EnhancedPlayer = PlayerRecord & {
  punten: number;
};

const positionWeight: Record<string, number> = {
  GK: 8,
  DEF: 10,
  MID: 12,
  FWD: 14,
};

export function derivePlayerPoints(player: PlayerRecord): number {
  const numericId = Number(player.id);
  const idSeed = Number.isFinite(numericId) ? numericId : player.id.length * 37;
  const base = positionWeight[player.positie] ?? 9;
  const variance = Math.abs(idSeed % 13);

  return base + variance;
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

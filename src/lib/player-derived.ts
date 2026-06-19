import type { PlayerRecord } from "@/domain/player";

export type EnhancedPlayer = PlayerRecord & {
  punten: number;
  inactive?: boolean;
  roundPoints?: number;
  totalPoints?: number;
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

export function getPlayerRoundPoints(player: Pick<EnhancedPlayer, "punten" | "roundPoints">): number {
  if (typeof player.roundPoints === "number") {
    return player.roundPoints;
  }

  return player.punten ?? 0;
}

export function getPlayerTotalPoints(player: Pick<EnhancedPlayer, "punten" | "totalPoints">): number {
  if (typeof player.totalPoints === "number") {
    return player.totalPoints;
  }

  return player.punten ?? 0;
}

export function byPriceDesc(a: PlayerRecord, b: PlayerRecord) {
  return b.prijs - a.prijs;
}

/**
 * Berekent totaalpunten voor een team.
 * Spelers in de basis (lineup) krijgen volle punten.
 * Spelers op de bank (bench) krijgen de helft, afgerond naar boven.
 */
export function computeTeamSquadPoints(
  lineupIds: string[],
  benchIds: string[],
  pointsById: Map<string, number>,
): number {
  let total = 0;
  for (const id of lineupIds) {
    total += pointsById.get(id) ?? 0;
  }
  for (const id of benchIds) {
    const pts = pointsById.get(id) ?? 0;
    total += Math.ceil(pts / 2);
  }
  return total;
}

import type { PlayerRecord } from "@/domain/player";
import type { WkMatchRow } from "./wk-sync-store";
import {
  isPlaceholderKnockoutLabel,
  normalizeWkCompetitionRound,
  normalizeWkTeamName,
} from "./wk-rounds";

export type CalculatedAvailabilityPlayer = {
  fantasyplayerId: number;
  totalPoints?: number;
  roundPoints?: number;
  advancementPoints?: number;
  pointEvents?: Array<{ eventCode: string; points: number; minute: number | null }>;
  source?: string;
};

export function buildActiveWkTeamsForRound(matches: WkMatchRow[], roundNumber?: number | null) {
  if (!Number.isInteger(roundNumber) || (roundNumber ?? 0) <= 0) {
    return new Set<string>();
  }

  const activeTeams = new Set<string>();
  for (const match of matches) {
    if (normalizeWkCompetitionRound(match.round) !== roundNumber) {
      continue;
    }
    if (!isPlaceholderKnockoutLabel(match.home_team)) {
      activeTeams.add(normalizeWkTeamName(match.home_team));
    }
    if (!isPlaceholderKnockoutLabel(match.away_team)) {
      activeTeams.add(normalizeWkTeamName(match.away_team));
    }
  }

  return activeTeams;
}

export function applyWkPlayerAvailabilityAndPoints(input: {
  csvPlayers: PlayerRecord[];
  calculatedPlayers?: CalculatedAvailabilityPlayer[];
  matches?: WkMatchRow[];
  roundNumber?: number | null;
}) {
  const calculatedPlayers = input.calculatedPlayers ?? [];
  const matches = input.matches ?? [];
  const activeTeams = buildActiveWkTeamsForRound(matches, input.roundNumber);
  const hasActiveTeamSnapshot = activeTeams.size > 0;
  const hasAvailabilitySnapshot = calculatedPlayers.length > 0;
  const calculatedById = new Map<number, CalculatedAvailabilityPlayer>();
  for (const player of calculatedPlayers) {
    calculatedById.set(player.fantasyplayerId, player);
  }

  return input.csvPlayers.map((csvPlayer) => {
    const playerId = Number.parseInt(csvPlayer.id, 10);
    const calculated = Number.isFinite(playerId) ? calculatedById.get(playerId) : undefined;
    const teamIsActive = activeTeams.has(normalizeWkTeamName(csvPlayer.club));
    const inferredIsActive = hasActiveTeamSnapshot
      ? teamIsActive
      : hasAvailabilitySnapshot
        ? Boolean(calculated)
        : undefined;
    const isActive = inferredIsActive ?? csvPlayer.isActive;
    const inactive = typeof inferredIsActive === "boolean"
      ? !inferredIsActive
      : typeof (csvPlayer as PlayerRecord & { inactive?: boolean }).inactive === "boolean"
        ? (csvPlayer as PlayerRecord & { inactive?: boolean }).inactive
        : typeof isActive === "boolean"
          ? !isActive
          : undefined;

    return {
      ...csvPlayer,
      inactive,
      isActive,
      punten: calculated?.totalPoints ?? 0,
      totalPoints: calculated?.totalPoints ?? 0,
      roundPoints: calculated?.roundPoints ?? 0,
      advancementPoints: calculated?.advancementPoints ?? 0,
      pointEvents: calculated?.pointEvents ?? [],
      scoreSource: calculated?.source ?? "wk-events-v1",
    };
  });
}

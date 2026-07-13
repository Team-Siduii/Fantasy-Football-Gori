import { isFinishedWkMatchStatus } from "./wk-match-schedule";
import { getWkMatches, type WkMatchRow } from "./wk-sync-store";
import { WORLD_CUP_2026_FIXTURES } from "./world-cup-schedule";

const WINNER_REF_REGEX = /^Winnaar duel (\d+)$/i;
const LOSER_REF_REGEX = /^Verliezer duel (\d+)$/i;

type KnockoutOutcome = "winner" | "loser";

function normalizeWkTeamName(input: string | null | undefined): string {
  const normalized = (input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

  switch (normalized) {
    case "bosnie herzegovina":
    case "bosnie en herzegovina":
    case "bosnia and herzegovina":
      return "bosnia herzegovina";
    case "saoedi arabie":
    case "saudi arabie":
    case "saudi arabia":
      return "saudi arabia";
    case "dr congo":
    case "congo dr":
      return "congo";
    default:
      return normalized;
  }
}

function resolveMatchOutcomeTeam(
  match: WkMatchRow | undefined,
  desiredOutcome: KnockoutOutcome,
): string | null {
  if (!match) {
    return null;
  }

  if (
    typeof match.home_score !== "number"
    || typeof match.away_score !== "number"
    || !isFinishedWkMatchStatus(match.status)
    || match.home_score === match.away_score
  ) {
    return null;
  }

  const winner = match.home_score > match.away_score ? match.home_team : match.away_team;
  const loser = match.home_score > match.away_score ? match.away_team : match.home_team;
  return desiredOutcome === "winner" ? winner : loser;
}

function resolveKnockoutReference(
  teamRef: string,
  matchesById: Map<number, WkMatchRow>,
): string | null {
  const winnerRef = teamRef.match(WINNER_REF_REGEX);
  if (winnerRef) {
    return resolveMatchOutcomeTeam(matchesById.get(Number(winnerRef[1])), "winner");
  }

  const loserRef = teamRef.match(LOSER_REF_REGEX);
  if (loserRef) {
    return resolveMatchOutcomeTeam(matchesById.get(Number(loserRef[1])), "loser");
  }

  return teamRef;
}

export async function getWkActiveTeamsForRound(round?: number): Promise<Set<string> | null> {
  if (!Number.isInteger(round) || (round ?? 0) <= 0) {
    return null;
  }

  const fixturesForRound = WORLD_CUP_2026_FIXTURES.filter((fixture) => fixture.round === round);
  if (fixturesForRound.length === 0) {
    return null;
  }

  const syncedMatches = await getWkMatches();
  const matchesById = new Map(syncedMatches.map((match) => [match.match_id, match] as const));
  const resolvedTeams: string[] = [];

  for (const fixture of fixturesForRound) {
    const homeTeam = resolveKnockoutReference(fixture.home, matchesById);
    const awayTeam = resolveKnockoutReference(fixture.away, matchesById);

    if (!homeTeam || !awayTeam) {
      return null;
    }

    resolvedTeams.push(homeTeam, awayTeam);
  }

  return new Set(resolvedTeams.map((team) => normalizeWkTeamName(team)));
}

export function isWkPlayerInactiveForRound(
  club: string,
  activeTeamsForRound: Set<string> | null,
): boolean | undefined {
  if (!activeTeamsForRound || activeTeamsForRound.size === 0) {
    return undefined;
  }

  return !activeTeamsForRound.has(normalizeWkTeamName(club));
}

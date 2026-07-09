import { getWkMatches } from "./wk-sync-store";

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

export async function getWkActiveTeamsForRound(round?: number): Promise<Set<string> | null> {
  if (!Number.isInteger(round) || (round ?? 0) <= 0) {
    return null;
  }

  const matches = await getWkMatches(round);
  if (matches.length === 0) {
    return null;
  }

  return new Set(
    matches.flatMap((match) => [
      normalizeWkTeamName(match.home_team),
      normalizeWkTeamName(match.away_team),
    ]),
  );
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

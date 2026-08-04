import type { SeasonFixture } from "./season-schedule";

export type SyncedWkMatchLike = {
  round: number;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  minute?: number | null;
  kickoff_at: string | null;
};

function normalizeFixtureTeamName(input: string | null | undefined): string {
  const normalized = (input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
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
    default:
      return normalized;
  }
}

function buildFixtureKey(round: number, home: string, away: string): string {
  return `${round}|${normalizeFixtureTeamName(home)}|${normalizeFixtureTeamName(away)}`;
}

function isPlaceholderKnockoutLabel(value: string | null | undefined): boolean {
  const normalized = normalizeFixtureTeamName(value);
  return normalized.startsWith("winnaar duel") || normalized.startsWith("verliezer duel") || normalized.startsWith("nummer ");
}

export function mergeWorldCupFixturesWithSyncedMatches(
  fixtures: SeasonFixture[],
  matches: SyncedWkMatchLike[],
): SeasonFixture[] {
  if (matches.length === 0) {
    return fixtures;
  }

  const matchByKey = new Map(
    matches.map((match) => [buildFixtureKey(match.round, match.home_team, match.away_team), match] as const),
  );

  const roundMatchesByRound = new Map<number, SyncedWkMatchLike[]>();
  for (const match of matches) {
    const list = roundMatchesByRound.get(match.round) ?? [];
    list.push(match);
    roundMatchesByRound.set(match.round, list);
  }

  const placeholderRoundFixtureIndexes = new Map<SeasonFixture, number>();
  const placeholderRoundFixturesByRound = new Map<number, SeasonFixture[]>();
  for (const fixture of fixtures) {
    if (!isPlaceholderKnockoutLabel(fixture.home) && !isPlaceholderKnockoutLabel(fixture.away)) {
      continue;
    }
    const list = placeholderRoundFixturesByRound.get(fixture.round) ?? [];
    placeholderRoundFixtureIndexes.set(fixture, list.length);
    list.push(fixture);
    placeholderRoundFixturesByRound.set(fixture.round, list);
  }

  return fixtures.map((fixture) => {
    const exactMatch = matchByKey.get(buildFixtureKey(fixture.round, fixture.home, fixture.away));
    if (exactMatch) {
      return {
        ...fixture,
        home: exactMatch.home_team || fixture.home,
        away: exactMatch.away_team || fixture.away,
        kickoffAt: exactMatch.kickoff_at ?? fixture.kickoffAt,
        homeScore: exactMatch.home_score ?? fixture.homeScore,
        awayScore: exactMatch.away_score ?? fixture.awayScore,
        status: exactMatch.status || fixture.status,
        minute: exactMatch.minute ?? fixture.minute ?? null,
      };
    }

    if (!isPlaceholderKnockoutLabel(fixture.home) && !isPlaceholderKnockoutLabel(fixture.away)) {
      return fixture;
    }

    const roundMatches = roundMatchesByRound.get(fixture.round) ?? [];
    const roundPlaceholderFixtures = placeholderRoundFixturesByRound.get(fixture.round) ?? [];
    if (roundMatches.length === 0 || roundMatches.length !== roundPlaceholderFixtures.length) {
      return fixture;
    }

    const placeholderIndex = placeholderRoundFixtureIndexes.get(fixture);
    const replacementMatch = typeof placeholderIndex === "number" ? roundMatches[placeholderIndex] : null;
    if (!replacementMatch) {
      return fixture;
    }

    return {
      ...fixture,
      home: replacementMatch.home_team || fixture.home,
      away: replacementMatch.away_team || fixture.away,
      kickoffAt: replacementMatch.kickoff_at ?? fixture.kickoffAt,
      homeScore: replacementMatch.home_score ?? fixture.homeScore,
      awayScore: replacementMatch.away_score ?? fixture.awayScore,
      status: replacementMatch.status || fixture.status,
      minute: replacementMatch.minute ?? fixture.minute ?? null,
    };
  });
}

export function isFinishedWkMatchStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").trim().toUpperCase();
  return ["F", "FT", "FINISHED", "AET", "PEN", "X"].includes(normalized);
}

export function isLiveWkMatchStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").trim().toUpperCase();
  if (!normalized) {
    return false;
  }

  if (isFinishedWkMatchStatus(normalized)) {
    return false;
  }

  return !["NS", "SCHEDULED", "PST", "POSTPONED", "CANC", "CANCELLED"].includes(normalized);
}

export function hasVisibleFixtureScore(fixture: Pick<SeasonFixture, "homeScore" | "awayScore">): boolean {
  return typeof fixture.homeScore === "number" && typeof fixture.awayScore === "number";
}

export function getWkMatchLiveMinuteLabel(
  minute: number | null | undefined,
  status: string | null | undefined,
): string | null {
  if (!isLiveWkMatchStatus(status)) {
    return null;
  }

  if (typeof minute === "number" && Number.isFinite(minute) && minute > 0) {
    return `${minute}'`;
  }

  const normalized = (status ?? "").trim().toUpperCase();
  const explicitMinute = normalized.match(/(\d{1,3})(?:\s*\+\s*(\d{1,2}))?/);
  if (explicitMinute) {
    return explicitMinute[2] ? `${explicitMinute[1]}+${explicitMinute[2]}'` : `${explicitMinute[1]}'`;
  }

  if (["HT", "HALF", "HALFTIME"].includes(normalized)) {
    return "rust";
  }

  if (["2H", "SECOND HALF"].includes(normalized)) {
    return "2e helft";
  }

  if (["1H", "FIRST HALF"].includes(normalized)) {
    return "1e helft";
  }

  return "nu";
}

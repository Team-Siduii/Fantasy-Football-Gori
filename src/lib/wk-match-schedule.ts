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
  return (input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function buildFixtureKey(round: number, home: string, away: string): string {
  return `${round}|${normalizeFixtureTeamName(home)}|${normalizeFixtureTeamName(away)}`;
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

  return fixtures.map((fixture) => {
    const match = matchByKey.get(buildFixtureKey(fixture.round, fixture.home, fixture.away));
    if (!match) {
      return fixture;
    }

    return {
      ...fixture,
      kickoffAt: match.kickoff_at ?? fixture.kickoffAt,
      homeScore: match.home_score ?? fixture.homeScore,
      awayScore: match.away_score ?? fixture.awayScore,
      status: match.status || fixture.status,
      minute: match.minute ?? fixture.minute ?? null,
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

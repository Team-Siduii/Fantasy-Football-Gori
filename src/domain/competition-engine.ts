export type LeagueTableTieBreaker = "GOAL_DIFFERENCE" | "GOALS_FOR" | "HEAD_TO_HEAD";
export type KnockoutTiePolicy = "PENALTIES" | "HIGHER_SEED";

export type MatchResult = {
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
};

export type LeagueTableRow = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export function buildLeagueTable(input: {
  teamIds: string[];
  matches: MatchResult[];
  tieBreakers: LeagueTableTieBreaker[];
}): { rows: LeagueTableRow[] } {
  const table = new Map<string, LeagueTableRow>();

  for (const id of input.teamIds) {
    table.set(id, {
      teamId: id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    });
  }

  for (const match of input.matches) {
    const home = table.get(match.homeTeamId);
    const away = table.get(match.awayTeamId);
    if (!home || !away) {
      continue;
    }

    home.played += 1;
    away.played += 1;

    home.goalsFor += match.homeGoals;
    home.goalsAgainst += match.awayGoals;
    away.goalsFor += match.awayGoals;
    away.goalsAgainst += match.homeGoals;

    if (match.homeGoals > match.awayGoals) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (match.homeGoals < match.awayGoals) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const rows = Array.from(table.values()).map((row) => ({
    ...row,
    goalDifference: row.goalsFor - row.goalsAgainst,
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    for (const tieBreaker of input.tieBreakers) {
      if (tieBreaker === "GOAL_DIFFERENCE" && b.goalDifference !== a.goalDifference) {
        return b.goalDifference - a.goalDifference;
      }

      if (tieBreaker === "GOALS_FOR" && b.goalsFor !== a.goalsFor) {
        return b.goalsFor - a.goalsFor;
      }

      if (tieBreaker === "HEAD_TO_HEAD") {
        // v1 fallback: deterministic op teamId; echte head-to-head matrix volgt in v2
        if (a.teamId !== b.teamId) {
          return a.teamId.localeCompare(b.teamId);
        }
      }
    }

    return a.teamId.localeCompare(b.teamId);
  });

  return { rows };
}

export function resolveKnockoutTie(input: {
  homeTeamId: string;
  awayTeamId: string;
  homeAggregate: number;
  awayAggregate: number;
  policy: KnockoutTiePolicy;
  penaltyWinnerTeamId?: string;
  higherSeedTeamId?: string;
}): string {
  if (input.homeAggregate > input.awayAggregate) {
    return input.homeTeamId;
  }

  if (input.awayAggregate > input.homeAggregate) {
    return input.awayTeamId;
  }

  if (input.policy === "PENALTIES") {
    if (input.penaltyWinnerTeamId === input.homeTeamId || input.penaltyWinnerTeamId === input.awayTeamId) {
      return input.penaltyWinnerTeamId;
    }

    throw new Error("penaltyWinnerTeamId is required when policy=PENALTIES and aggregate is tied");
  }

  if (input.higherSeedTeamId === input.homeTeamId || input.higherSeedTeamId === input.awayTeamId) {
    return input.higherSeedTeamId;
  }

  throw new Error("higherSeedTeamId is required when policy=HIGHER_SEED and aggregate is tied");
}

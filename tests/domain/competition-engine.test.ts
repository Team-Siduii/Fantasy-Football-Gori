import { describe, expect, it } from "vitest";
import {
  buildLeagueTable,
  resolveKnockoutTie,
  type MatchResult,
} from "../../src/domain/competition-engine";

describe("competition abstraction v1", () => {
  it("bouwt league table met configureerbare tiebreakers", () => {
    const matches: MatchResult[] = [
      { homeTeamId: "A", awayTeamId: "B", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "B", awayTeamId: "C", homeGoals: 2, awayGoals: 0 },
      { homeTeamId: "C", awayTeamId: "A", homeGoals: 1, awayGoals: 0 },
    ];

    const table = buildLeagueTable({
      teamIds: ["A", "B", "C"],
      matches,
      tieBreakers: ["GOAL_DIFFERENCE", "GOALS_FOR", "HEAD_TO_HEAD"],
    });

    expect(table.rows).toHaveLength(3);
    expect(table.rows[0].teamId).toBe("B");
  });

  it("ondersteunt knockout winnaar via tie-break policy", () => {
    const winner = resolveKnockoutTie({
      homeTeamId: "A",
      awayTeamId: "B",
      homeAggregate: 2,
      awayAggregate: 2,
      policy: "PENALTIES",
      penaltyWinnerTeamId: "B",
    });

    expect(winner).toBe("B");
  });
});

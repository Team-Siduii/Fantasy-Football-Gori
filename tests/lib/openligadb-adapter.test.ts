import { describe, expect, it } from "vitest";
import {
  mapOpenLigaDbMatchesToNormalized,
  type OpenLigaDbMatch,
} from "../../src/lib/data-sources/openligadb";

describe("openligadb adapter", () => {
  it("maps HT/FT, goals, cards and quality flags", () => {
    const matches: OpenLigaDbMatch[] = [
      {
        matchID: 1,
        matchDateTimeUTC: "2026-06-14T19:00:00Z",
        team1: { teamName: "Nederland" },
        team2: { teamName: "Frankrijk" },
        matchResults: [
          { resultName: "Halbzeitergebnis", pointsTeam1: 1, pointsTeam2: 0 },
          { resultName: "Endergebnis", pointsTeam1: 2, pointsTeam2: 1 },
        ],
        goals: [
          {
            matchMinute: 12,
            goalGetterID: 10,
            goalGetterName: "Memphis Depay",
            scoreTeam1: 1,
            scoreTeam2: 0,
            comment: null,
          },
          {
            matchMinute: 67,
            goalGetterID: 20,
            goalGetterName: "Kylian Mbappé",
            scoreTeam1: 1,
            scoreTeam2: 1,
            comment: "assist: Antoine Griezmann; yellow card: Aurélien Tchouaméni",
          },
          {
            matchMinute: 80,
            goalGetterID: 11,
            goalGetterName: "Xavi Simons",
            scoreTeam1: 2,
            scoreTeam2: 1,
            comment: "red card: Dayot Upamecano",
          },
        ],
      },
    ];

    const normalized = mapOpenLigaDbMatchesToNormalized(matches);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].scoreHT).toEqual({ home: 1, away: 0 });
    expect(normalized[0].scoreFT).toEqual({ home: 2, away: 1 });
    expect(normalized[0].events.filter((event) => event.type === "goal")).toHaveLength(3);
    expect(normalized[0].events.some((event) => event.type === "assist")).toBe(true);
    expect(normalized[0].events.some((event) => event.type === "yellow_card")).toBe(true);
    expect(normalized[0].events.some((event) => event.type === "red_card")).toBe(true);
    expect(normalized[0].quality.hasSaves).toBe(false);
    expect(normalized[0].quality.completeness).toBe(83);
  });
});

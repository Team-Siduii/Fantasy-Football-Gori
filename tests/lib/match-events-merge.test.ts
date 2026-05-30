import { describe, expect, it } from "vitest";
import {
  mergeNormalizedMatches,
  type NormalizedMatch,
} from "../../src/lib/data-sources/match-events-merge";

describe("match-events merge", () => {
  it("prefers OpenLigaDB for scores/goals and TheSportsDB for assists/saves/cards", () => {
    const openliga: NormalizedMatch[] = [
      {
        source: "openligadb",
        sourceMatchId: "ol-1",
        kickoffAt: "2026-06-14T19:00:00Z",
        homeTeam: "Nederland",
        awayTeam: "Frankrijk",
        scoreHT: { home: 1, away: 0 },
        scoreFT: { home: 2, away: 1 },
        events: [{ type: "goal", minute: 12, team: "Nederland", playerName: "Depay", playerExternalId: "10", source: "openligadb", confidence: "high" }],
        quality: { hasScoreHT: true, hasScoreFT: true, hasGoals: true, hasAssists: false, hasSaves: false, hasCards: false, completeness: 50 },
      },
    ];

    const sportsdb: NormalizedMatch[] = [
      {
        source: "thesportsdb",
        sourceMatchId: "ts-9",
        kickoffAt: "2026-06-14T19:00:00Z",
        homeTeam: "Nederland",
        awayTeam: "Frankrijk",
        scoreHT: null,
        scoreFT: null,
        events: [
          { type: "assist", minute: 12, team: "Nederland", playerName: "Simons", playerExternalId: null, source: "thesportsdb", confidence: "medium" },
          { type: "yellow_card", minute: 45, team: "Frankrijk", playerName: "Tchouameni", playerExternalId: null, source: "thesportsdb", confidence: "medium" },
          { type: "goalkeeper_save", minute: 52, team: "Nederland", playerName: "Verbruggen", playerExternalId: null, source: "thesportsdb", confidence: "medium" },
        ],
        quality: { hasScoreHT: false, hasScoreFT: false, hasGoals: false, hasAssists: true, hasSaves: true, hasCards: true, completeness: 50 },
      },
    ];

    const merged = mergeNormalizedMatches(openliga, sportsdb);
    expect(merged).toHaveLength(1);
    expect(merged[0].scoreFT).toEqual({ home: 2, away: 1 });
    expect(merged[0].events.some((event) => event.type === "goal")).toBe(true);
    expect(merged[0].events.some((event) => event.type === "assist")).toBe(true);
    expect(merged[0].events.some((event) => event.type === "yellow_card")).toBe(true);
    expect(merged[0].events.some((event) => event.type === "goalkeeper_save")).toBe(true);
  });
});

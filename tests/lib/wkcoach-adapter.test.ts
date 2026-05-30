import { describe, expect, it } from "vitest";
import {
  mapWkcoachPointsDetailedToSnapshot,
  enrichMatchesWithWkcoachPoints,
} from "../../src/lib/data-sources/wkcoach";
import type { NormalizedMatch } from "../../src/lib/data-sources/match-events-merge";

describe("wkcoach adapter", () => {
  it("maps points-detailed payload to player snapshot", () => {
    const payload = {
      round_sequence: 1,
      round_points: 12,
      total_points: 30,
      players: [
        { player_name: "Kylian Mbappé", round_points: 7, total_points: 10, club_fullname: "Frankrijk" },
        { player_name: "Xavi Simons", round_points: 5, total_points: 9, club_fullname: "Nederland" },
      ],
    };

    const snapshot = mapWkcoachPointsDetailedToSnapshot(payload);
    expect(snapshot.roundSequence).toBe(1);
    expect(snapshot.players).toHaveLength(2);
    expect(snapshot.players[0].playerName).toBe("Kylian Mbappé");
  });

  it("enriches normalized events with wkcoach player points by name", () => {
    const matches: NormalizedMatch[] = [
      {
        source: "openligadb",
        sourceMatchId: "1",
        kickoffAt: "2026-06-14T19:00:00Z",
        homeTeam: "Nederland",
        awayTeam: "Frankrijk",
        scoreHT: { home: 1, away: 0 },
        scoreFT: { home: 2, away: 1 },
        events: [
          { type: "goal", minute: 67, team: "Frankrijk", playerName: "Kylian Mbappé", playerExternalId: null, source: "openligadb", confidence: "high" },
        ],
        quality: { hasScoreHT: true, hasScoreFT: true, hasGoals: true, hasAssists: false, hasSaves: false, hasCards: false, completeness: 50 },
      },
    ];

    const enriched = enrichMatchesWithWkcoachPoints(matches, {
      roundSequence: 1,
      players: [{ playerName: "Kylian Mbappé", roundPoints: 7, totalPoints: 10, teamName: "Frankrijk" }],
    });

    expect(enriched[0].events[0].wkcoachRoundPoints).toBe(7);
    expect(enriched[0].events[0].wkcoachTotalPoints).toBe(10);
  });
});

import { describe, expect, it } from "vitest";

import type { SeasonFixture } from "../../src/lib/season-schedule";
import {
  getWkMatchLiveMinuteLabel,
  hasVisibleFixtureScore,
  isLiveWkMatchStatus,
  mergeWorldCupFixturesWithSyncedMatches,
  type SyncedWkMatchLike,
} from "../../src/lib/wk-match-schedule";

const BASE_FIXTURE: SeasonFixture = {
  round: 1,
  home: "Nederland",
  away: "Japan",
  kickoff: "21:00",
  kickoffAt: "2026-06-12T21:00:00.000Z",
};

describe("wk-match-schedule", () => {
  it("merges synced WK match scores into the static fixture list", () => {
    const syncedMatches: SyncedWkMatchLike[] = [
      {
        round: 1,
        home_team: "NEDERLAND",
        away_team: "Japan",
        home_score: 2,
        away_score: 1,
        status: "FT",
        minute: 67,
        kickoff_at: "2026-06-12T21:05:00.000Z",
      },
    ];

    const [mergedFixture] = mergeWorldCupFixturesWithSyncedMatches([BASE_FIXTURE], syncedMatches);

    expect(mergedFixture).toMatchObject({
      homeScore: 2,
      awayScore: 1,
      status: "FT",
      minute: 67,
      kickoffAt: "2026-06-12T21:05:00.000Z",
    });
  });

  it("detects live statuses and visible scores for in-progress matches", () => {
    const liveFixture: SeasonFixture = {
      ...BASE_FIXTURE,
      homeScore: 1,
      awayScore: 0,
      status: "LIVE",
      minute: 54,
    };

    expect(isLiveWkMatchStatus(liveFixture.status)).toBe(true);
    expect(hasVisibleFixtureScore(liveFixture)).toBe(true);
    expect(getWkMatchLiveMinuteLabel(liveFixture.minute, liveFixture.status)).toBe("54'");
  });

  it("keeps future fixtures without visible scores hidden until a score exists", () => {
    expect(hasVisibleFixtureScore(BASE_FIXTURE)).toBe(false);
    expect(isLiveWkMatchStatus(BASE_FIXTURE.status)).toBe(false);
  });

  it("treats WKCoach status X as finished instead of live", () => {
    expect(isLiveWkMatchStatus("X")).toBe(false);
    expect(getWkMatchLiveMinuteLabel(null, "X")).toBeNull();
  });
});

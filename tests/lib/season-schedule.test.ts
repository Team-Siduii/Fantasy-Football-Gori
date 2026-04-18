import { describe, expect, it } from "vitest";
import {
  getCurrentOrNextRound,
  groupFixturesByRound,
  REMAINING_FIXTURES_2025_2026,
  SCHEDULE_SPONSOR,
} from "../../src/lib/season-schedule";

describe("season-schedule", () => {
  it("contains sponsor and 4 grouped rounds (31-34) with 9 matches each", () => {
    expect(SCHEDULE_SPONSOR).toBe("Staatsloterij");

    const grouped = groupFixturesByRound(REMAINING_FIXTURES_2025_2026);
    expect(grouped.map((group) => group.round)).toEqual([31, 32, 33, 34]);
    expect(grouped.every((group) => group.fixtures.length === 9)).toBe(true);
  });

  it("returns upcoming round based on current date", () => {
    const beforeRound31 = getCurrentOrNextRound(REMAINING_FIXTURES_2025_2026, new Date("2026-04-21T23:00:00Z"));
    const duringRound32 = getCurrentOrNextRound(REMAINING_FIXTURES_2025_2026, new Date("2026-05-03T10:00:00Z"));
    const afterSeason = getCurrentOrNextRound(REMAINING_FIXTURES_2025_2026, new Date("2026-05-20T10:00:00Z"));

    expect(beforeRound31).toBe(31);
    expect(duringRound32).toBe(32);
    expect(afterSeason).toBe(34);
  });
});

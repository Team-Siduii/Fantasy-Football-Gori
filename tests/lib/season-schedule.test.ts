import { describe, expect, it } from "vitest";
import {
  getCurrentOrNextRound,
  getDefaultVisibleRound,
  getLatestCompletedRound,
  groupFixturesByRound,
  REMAINING_FIXTURES_2025_2026,
  SCHEDULE_SPONSOR,
} from "../../src/lib/season-schedule";

describe("season-schedule", () => {
  it("contains sponsor and 5 grouped rounds (30-34) with 9 matches each", () => {
    expect(SCHEDULE_SPONSOR).toBe("Staatsloterij");

    const grouped = groupFixturesByRound(REMAINING_FIXTURES_2025_2026);
    expect(grouped.map((group) => group.round)).toEqual([30, 31, 32, 33, 34]);
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

  it("keeps the latest completed round visible until the next WK round really starts", () => {
    const round7FinishedBeforeRound8Kickoff = new Date("2026-07-18T18:00:00+02:00");
    const duringRound8 = new Date("2026-07-19T21:30:00+02:00");

    expect(getLatestCompletedRound(REMAINING_FIXTURES_2025_2026, new Date("2026-04-21T23:00:00Z"))).toBe(30);
    expect(getDefaultVisibleRound(REMAINING_FIXTURES_2025_2026, new Date("2026-04-21T23:00:00Z"))).toBe(30);

    expect(getLatestCompletedRound([
      { round: 7, dateLabel: "Vrijdag", kickoff: "20:00", kickoffAt: "2026-07-17T20:00:00+02:00", home: "A", away: "B" },
      { round: 8, dateLabel: "Zondag", kickoff: "20:00", kickoffAt: "2026-07-19T20:00:00+02:00", home: "C", away: "D" },
    ], round7FinishedBeforeRound8Kickoff)).toBe(7);

    expect(getDefaultVisibleRound([
      { round: 7, dateLabel: "Vrijdag", kickoff: "20:00", kickoffAt: "2026-07-17T20:00:00+02:00", home: "A", away: "B" },
      { round: 8, dateLabel: "Zondag", kickoff: "20:00", kickoffAt: "2026-07-19T20:00:00+02:00", home: "C", away: "D" },
    ], round7FinishedBeforeRound8Kickoff)).toBe(7);

    expect(getDefaultVisibleRound([
      { round: 7, dateLabel: "Vrijdag", kickoff: "20:00", kickoffAt: "2026-07-17T20:00:00+02:00", home: "A", away: "B" },
      { round: 8, dateLabel: "Zondag", kickoff: "20:00", kickoffAt: "2026-07-19T20:00:00+02:00", home: "C", away: "D" },
    ], duringRound8)).toBe(8);
  });
});

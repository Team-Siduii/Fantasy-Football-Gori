import { describe, expect, it } from "vitest";
import { WORLD_CUP_2026_FIXTURES, getLatestCompletedWorldCupRound } from "../../src/lib/world-cup-schedule";

describe("world-cup-schedule", () => {
  it("contains grouped matchdays where round 1/2/3 exist", () => {
    const rounds = Array.from(new Set(WORLD_CUP_2026_FIXTURES.map((fixture) => fixture.round))).sort((a, b) => a - b);

    expect(rounds.slice(0, 3)).toEqual([1, 2, 3]);
    expect(WORLD_CUP_2026_FIXTURES.length).toBeGreaterThanOrEqual(24);
  });

  it("keeps finale and troostfinale together in round 8 with explicit stage labels", () => {
    const finalRoundFixtures = WORLD_CUP_2026_FIXTURES.filter((fixture) => fixture.round === 8);

    expect(finalRoundFixtures).toHaveLength(2);
    expect(finalRoundFixtures.map((fixture) => fixture.stageLabel)).toEqual(["Troostfinale", "Finale"]);
  });

  it("returns the latest completed round instead of the next scheduled round", () => {
    expect(getLatestCompletedWorldCupRound(new Date("2026-07-18T22:00:00+02:00"))).toBe(7);
    expect(getLatestCompletedWorldCupRound(new Date("2026-07-20T00:30:00+02:00"))).toBe(8);
  });
});

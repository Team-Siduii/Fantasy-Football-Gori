import { describe, expect, it } from "vitest";
import { getPreferredWkRound, WORLD_CUP_2026_FIXTURES } from "../../src/lib/world-cup-schedule";

describe("world-cup-schedule", () => {
  it("contains grouped matchdays where round 1/2/3 exist", () => {
    const rounds = Array.from(new Set(WORLD_CUP_2026_FIXTURES.map((fixture) => fixture.round))).sort((a, b) => a - b);

    expect(rounds.slice(0, 3)).toEqual([1, 2, 3]);
    expect(WORLD_CUP_2026_FIXTURES.length).toBeGreaterThanOrEqual(24);
  });

  it("defaults WK team views to the active round when a round is in progress", () => {
    expect(getPreferredWkRound(WORLD_CUP_2026_FIXTURES, new Date("2026-07-14T18:00:00+02:00"))).toBe(6);
    expect(getPreferredWkRound(WORLD_CUP_2026_FIXTURES, new Date("2026-07-14T22:00:00+02:00"))).toBe(7);
    expect(getPreferredWkRound(WORLD_CUP_2026_FIXTURES, new Date("2026-07-17T12:00:00+02:00"))).toBe(7);
  });
});

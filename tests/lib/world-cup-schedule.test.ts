import { describe, expect, it } from "vitest";
import { WORLD_CUP_2026_FIXTURES } from "../../src/lib/world-cup-schedule";

describe("world-cup-schedule", () => {
  it("contains grouped matchdays where round 1/2/3 exist", () => {
    const rounds = Array.from(new Set(WORLD_CUP_2026_FIXTURES.map((fixture) => fixture.round))).sort((a, b) => a - b);

    expect(rounds.slice(0, 3)).toEqual([1, 2, 3]);
    expect(WORLD_CUP_2026_FIXTURES.length).toBeGreaterThanOrEqual(24);
  });
});

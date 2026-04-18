import { describe, expect, it } from "vitest";
import { buildPitchRows } from "../../src/domain/pitch-layout";

describe("buildPitchRows", () => {
  it("maps each lineup index once across pitch rows", () => {
    const lineup = Array.from({ length: 11 }, (_, index) => `p${index}`);

    const rows = buildPitchRows("4-3-3", lineup);

    expect(rows).toEqual([
      ["p0"],
      ["p1", "p2", "p3", "p4"],
      ["p5", "p6", "p7"],
      ["p8", "p9", "p10"],
    ]);
  });

  it("drops missing cards when lineup is shorter than formation", () => {
    const rows = buildPitchRows("4-4-2", ["gk", "d1", "d2", "d3"]);

    expect(rows).toEqual([["gk"], ["d1", "d2", "d3"], [], []]);
  });
});

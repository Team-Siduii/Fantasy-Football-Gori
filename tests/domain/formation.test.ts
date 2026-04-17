import { describe, expect, it } from "vitest";
import { buildFormationSlots } from "../../src/domain/formation";

describe("buildFormationSlots", () => {
  it("builds rows for a 4-3-3 formation", () => {
    const rows = buildFormationSlots("4-3-3");

    expect(rows).toEqual([
      ["GK"],
      ["DEF", "DEF", "DEF", "DEF"],
      ["MID", "MID", "MID"],
      ["FWD", "FWD", "FWD"],
    ]);
  });

  it("falls back to 4-3-3 for invalid formations", () => {
    const rows = buildFormationSlots("2-2-6");

    expect(rows).toEqual([
      ["GK"],
      ["DEF", "DEF", "DEF", "DEF"],
      ["MID", "MID", "MID"],
      ["FWD", "FWD", "FWD"],
    ]);
  });
});

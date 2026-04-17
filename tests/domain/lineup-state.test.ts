import { describe, expect, it } from "vitest";
import { reorderAcrossZones, type ZoneState } from "../../src/domain/lineup-state";

function createState(): ZoneState<string> {
  return {
    lineup: ["p1", "p2", "p3"],
    bench: ["b1", "b2", "b3"],
  };
}

describe("reorderAcrossZones", () => {
  it("reorders cards inside lineup zone", () => {
    const next = reorderAcrossZones(createState(), {
      sourceZone: "lineup",
      sourceIndex: 0,
      targetZone: "lineup",
      targetIndex: 2,
    });

    expect(next.lineup).toEqual(["p2", "p3", "p1"]);
    expect(next.bench).toEqual(["b1", "b2", "b3"]);
  });

  it("swaps lineup card with bench card when dragging across zones", () => {
    const next = reorderAcrossZones(createState(), {
      sourceZone: "lineup",
      sourceIndex: 1,
      targetZone: "bench",
      targetIndex: 0,
    });

    expect(next.lineup).toEqual(["p1", "b1", "p3"]);
    expect(next.bench).toEqual(["p2", "b2", "b3"]);
  });

  it("returns original state when indexes are out of bounds", () => {
    const state = createState();
    const next = reorderAcrossZones(state, {
      sourceZone: "lineup",
      sourceIndex: 99,
      targetZone: "bench",
      targetIndex: 0,
    });

    expect(next).toEqual(state);
  });
});

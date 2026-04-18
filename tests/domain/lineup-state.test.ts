import { describe, expect, it } from "vitest";
import { reorderAcrossZones, type ZoneState } from "../../src/domain/lineup-state";

type FakePlayer = {
  id: string;
  positie: "GK" | "DEF" | "MID" | "FWD";
};

function createState(): ZoneState<FakePlayer> {
  return {
    lineup: [
      { id: "p1", positie: "DEF" },
      { id: "p2", positie: "MID" },
      { id: "p3", positie: "FWD" },
    ],
    bench: [
      { id: "b1", positie: "DEF" },
      { id: "b2", positie: "MID" },
      { id: "b3", positie: "GK" },
    ],
  };
}

describe("reorderAcrossZones", () => {
  it("reorders cards inside bench zone", () => {
    const next = reorderAcrossZones(createState(), {
      sourceZone: "bench",
      sourceIndex: 0,
      targetZone: "bench",
      targetIndex: 2,
    });

    expect(next.bench.map((player) => player.id)).toEqual(["b2", "b3", "b1"]);
    expect(next.lineup.map((player) => player.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("swaps lineup card with bench card when dragging across zones", () => {
    const next = reorderAcrossZones(
      createState(),
      {
        sourceZone: "lineup",
        sourceIndex: 1,
        targetZone: "bench",
        targetIndex: 1,
      },
      {
        enforceLineupPosition: true,
        getPosition: (player) => player.positie,
      },
    );

    expect(next.lineup.map((player) => player.id)).toEqual(["p1", "b2", "p3"]);
    expect(next.bench.map((player) => player.id)).toEqual(["b1", "p2", "b3"]);
  });

  it("rejects cross-zone swap when lineup slot position does not match", () => {
    const state = createState();
    const next = reorderAcrossZones(
      state,
      {
        sourceZone: "bench",
        sourceIndex: 2,
        targetZone: "lineup",
        targetIndex: 1,
      },
      {
        enforceLineupPosition: true,
        getPosition: (player) => player.positie,
      },
    );

    expect(next).toEqual(state);
  });

  it("rejects lineup-to-lineup move when positions differ", () => {
    const state = createState();
    const next = reorderAcrossZones(
      state,
      {
        sourceZone: "lineup",
        sourceIndex: 0,
        targetZone: "lineup",
        targetIndex: 2,
      },
      {
        enforceLineupPosition: true,
        getPosition: (player) => player.positie,
      },
    );

    expect(next).toEqual(state);
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

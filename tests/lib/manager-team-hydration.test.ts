import { describe, expect, it } from "vitest";

import { hydrateSavedTeamState } from "../../src/lib/manager-team-hydration";
import type { EnhancedPlayer } from "../../src/lib/player-derived";

function player(id: string, positie: "GK" | "DEF" | "MID" | "FWD", extras: Partial<EnhancedPlayer> = {}): EnhancedPlayer {
  return {
    id,
    naam: id,
    positie,
    club: "NL",
    prijs: 10,
    punten: 0,
    ...extras,
  };
}

describe("hydrateSavedTeamState", () => {
  it("preserves the exact saved lineup, bench, and formation slots for a round snapshot", () => {
    const players = [
      player("gk-1", "GK"),
      player("def-1", "DEF"),
      player("def-2", "DEF"),
      player("def-3", "DEF"),
      player("mid-1", "MID"),
      player("mid-2", "MID"),
      player("mid-3", "MID"),
      player("mid-4", "MID"),
      player("fwd-1", "FWD"),
      player("fwd-2", "FWD"),
      player("fwd-3", "FWD"),
      player("bench-gk", "GK"),
      player("bench-def", "DEF"),
      player("bench-mid", "MID"),
      player("bench-fwd", "FWD"),
    ];

    const state = hydrateSavedTeamState({
      players,
      formation: "3-4-3",
      lineupIds: ["gk-1", "def-1", "def-2", "def-3", "mid-1", "mid-2", "mid-3", "mid-4", "fwd-1", "fwd-2", "fwd-3"],
      benchIds: ["bench-gk", "bench-def", "bench-mid", "bench-fwd"],
    });

    expect(state.lineup.map((entry) => entry.id)).toEqual([
      "gk-1",
      "def-1",
      "def-2",
      "def-3",
      "mid-1",
      "mid-2",
      "mid-3",
      "mid-4",
      "fwd-1",
      "fwd-2",
      "fwd-3",
    ]);
    expect(state.bench.map((entry) => entry.id)).toEqual(["bench-gk", "bench-def", "bench-mid", "bench-fwd"]);
  });

  it("keeps refreshed round and total points on the hydrated player cards", () => {
    const state = hydrateSavedTeamState({
      players: [
        player("mid-1", "MID", { punten: 18, roundPoints: 0, totalPoints: 18 }),
        player("bench-mid", "MID", { punten: 12, roundPoints: 4, totalPoints: 12 }),
      ],
      formation: "4-3-3",
      lineupIds: ["mid-1"],
      benchIds: ["bench-mid"],
    });

    expect(state.lineup[0]).toMatchObject({ id: "mid-1", roundPoints: 0, totalPoints: 18, punten: 18 });
    expect(state.bench[0]).toMatchObject({ id: "bench-mid", roundPoints: 4, totalPoints: 12, punten: 12 });
  });

  it("fills missing saved ids with deterministic open slots in the expected positions", () => {
    const state = hydrateSavedTeamState({
      players: [player("gk-1", "GK"), player("bench-gk", "GK")],
      formation: "4-4-2",
      lineupIds: ["gk-1"],
      benchIds: ["bench-gk"],
    });

    expect(state.lineup).toHaveLength(11);
    expect(state.bench).toHaveLength(4);
    expect(state.lineup[0].id).toBe("gk-1");
    expect(state.lineup[1]).toMatchObject({ id: "open-lineup-DEF-1", positie: "DEF", punten: 0, roundPoints: 0, totalPoints: 0 });
    expect(state.bench[0].id).toBe("bench-gk");
    expect(state.bench[1]).toMatchObject({ id: "open-bench-DEF-1", positie: "DEF" });
  });
});

import { describe, expect, it } from "vitest";
import { hydrateSavedSquadState } from "../../src/lib/manager-team-hydration";
import type { EnhancedPlayer } from "../../src/lib/player-derived";

function player(id: string, naam: string, positie: "GK" | "DEF" | "MID" | "FWD"): EnhancedPlayer {
  return {
    id,
    naam,
    positie,
    club: "Testland",
    prijs: 5,
    punten: 0,
  };
}

describe("hydrateSavedSquadState", () => {
  it("preserves the saved lineup and bench order for valid WK squads with a non-rigid bench composition", () => {
    const players = [
      player("863", "Luca Zidane", "GK"),
      player("31", "Amar Dedic", "DEF"),
      player("299", "Rúben Dias", "DEF"),
      player("313", "Joško Gvardiol", "DEF"),
      player("7", "Kim Moon-hwan", "DEF"),
      player("285", "Martin Ødegaard", "MID"),
      player("439", "Ismael Saibari", "MID"),
      player("595", "Brian Gutiérrez", "MID"),
      player("297", "Donyell Malen", "FWD"),
      player("98", "Ayase Ueda", "FWD"),
      player("240", "Harry Kane", "FWD"),
      player("712", "Lamine Camara", "MID"),
      player("1359", "Bradley Cross", "DEF"),
      player("1250", "Mohamed Manai", "MID"),
      player("253", "Unai Simón", "GK"),
    ];

    const result = hydrateSavedSquadState({
      players,
      formation: "4-3-3",
      lineupIds: ["863", "31", "299", "313", "7", "285", "439", "595", "297", "98", "240"],
      benchIds: ["712", "1359", "1250", "253"],
      benchPositions: ["GK", "DEF", "MID", "FWD"],
    });

    expect(result.lineup.map((entry) => entry.id)).toEqual(["863", "31", "299", "313", "7", "285", "439", "595", "297", "98", "240"]);
    expect(result.bench.map((entry) => entry.id)).toEqual(["712", "1359", "1250", "253"]);
    expect([...result.lineup, ...result.bench].some((entry) => entry.id.startsWith("open-"))).toBe(false);
  });

  it("rebalances malformed saved squads so the lineup always matches the requested formation positions", () => {
    const players = [
      player("gk-1", "Starting Keeper", "GK"),
      player("def-1", "Defender 1", "DEF"),
      player("def-2", "Defender 2", "DEF"),
      player("def-3", "Defender 3", "DEF"),
      player("def-4", "Defender 4", "DEF"),
      player("mid-1", "Midfielder 1", "MID"),
      player("mid-2", "Midfielder 2", "MID"),
      player("mid-3", "Bench Midfielder", "MID"),
      player("fwd-1", "Forward 1", "FWD"),
      player("fwd-2", "Forward 2", "FWD"),
      player("fwd-3", "Forward 3", "FWD"),
      player("fwd-4", "Extra Forward", "FWD"),
      player("gk-2", "Bench Keeper", "GK"),
      player("def-5", "Bench Defender", "DEF"),
      player("mid-4", "Reserve Midfielder", "MID"),
    ];

    const result = hydrateSavedSquadState({
      players,
      formation: "4-3-3",
      lineupIds: ["mid-1", "def-1", "fwd-1", "def-2", "mid-2", "def-3", "fwd-2", "fwd-3", "def-4", "gk-1", "fwd-4"],
      benchIds: ["mid-3", "gk-2", "def-5", "mid-4"],
      benchPositions: ["GK", "DEF", "MID", "FWD"],
    });

    expect(result.lineup.map((entry) => entry.positie)).toEqual(["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD"]);
    expect(result.lineup.map((entry) => entry.id)).toEqual(["gk-1", "def-1", "def-2", "def-3", "def-4", "mid-1", "mid-2", "mid-3", "fwd-1", "fwd-2", "fwd-3"]);
    expect(result.bench.map((entry) => entry.id)).toEqual(["fwd-4", "gk-2", "def-5", "mid-4"]);
  });

  it("fills only genuinely missing saved players with open slots and keeps inactive graveyard players", () => {
    const players = [
      player("1", "Keeper", "GK"),
      player("2", "Defender", "DEF"),
      player("3", "Midfielder", "MID"),
      player("4", "Forward", "FWD"),
    ];

    const result = hydrateSavedSquadState({
      players,
      formation: "4-3-3",
      lineupIds: ["1", "2", "graveyard-9"],
      benchIds: ["missing-1"],
      benchPositions: ["GK", "DEF", "MID", "FWD"],
      resolveInactivePlayer: (id) =>
        id === "graveyard-9"
          ? {
              id,
              naam: "Inactive Hero",
              positie: "MID",
              club: "Testland",
              prijs: 4,
              punten: 0,
            }
          : null,
    });

    expect(result.lineup[0].id).toBe("1");
    expect(result.lineup[1].id).toBe("2");
    expect(result.lineup[5].id).toBe("graveyard-9");
    expect(result.lineup[5].inactive).toBe(true);
    expect(result.bench[0].id.startsWith("open-")).toBe(true);
    expect(result.bench[2].id.startsWith("open-")).toBe(true);
    expect(result.bench[3].id.startsWith("open-")).toBe(true);
  });
});

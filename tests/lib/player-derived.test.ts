import { describe, expect, it } from "vitest";
import { derivePlayerPoints, enrichPlayers } from "../../src/lib/player-derived";

describe("player-derived", () => {
  it("starts every player at 0 punten", () => {
    const pointsA = derivePlayerPoints({ id: "101", naam: "A", club: "PSV", positie: "MID", prijs: 4 });
    const pointsB = derivePlayerPoints({ id: "88", naam: "B", club: "AJA", positie: "FWD", prijs: 2 });

    expect(pointsA).toBe(0);
    expect(pointsB).toBe(0);
  });

  it("enriches each player with punten=0", () => {
    const players = enrichPlayers([{ id: "1", naam: "A", club: "PSV", positie: "GK", prijs: 1 }]);
    expect(players[0].punten).toBe(0);
  });
});

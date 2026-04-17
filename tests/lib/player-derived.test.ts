import { describe, expect, it } from "vitest";
import { derivePlayerPoints, enrichPlayers } from "../../src/lib/player-derived";

describe("player-derived", () => {
  it("derives deterministic points from player id and position", () => {
    const pointsA = derivePlayerPoints({ id: "101", naam: "A", club: "PSV", positie: "MID", prijs: 4 });
    const pointsB = derivePlayerPoints({ id: "101", naam: "B", club: "AJA", positie: "MID", prijs: 2 });

    expect(pointsA).toBe(pointsB);
  });

  it("enriches each player with punten", () => {
    const players = enrichPlayers([{ id: "1", naam: "A", club: "PSV", positie: "GK", prijs: 1 }]);
    expect(players[0].punten).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { derivePlayerPoints, enrichPlayers } from "../../src/lib/player-derived";

describe("player-derived", () => {
  it("loads demo voorbeeld: Mbappé krijgt 12 punten in huidige ronde", () => {
    const mbappe = derivePlayerPoints({ id: "237", naam: "Kylian Mbappé", club: "Frankrijk", positie: "FWD", prijs: 15 });
    const other = derivePlayerPoints({ id: "88", naam: "B", club: "AJA", positie: "FWD", prijs: 2 });

    expect(mbappe).toBe(12);
    expect(other).toBe(0);
  });

  it("enriches each player with derived punten", () => {
    const players = enrichPlayers([
      { id: "237", naam: "Kylian Mbappé", club: "Frankrijk", positie: "FWD", prijs: 15 },
      { id: "1", naam: "A", club: "PSV", positie: "GK", prijs: 1 },
    ]);
    expect(players[0].punten).toBe(12);
    expect(players[1].punten).toBe(0);
  });
});

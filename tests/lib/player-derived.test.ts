import { describe, expect, it } from "vitest";
import { derivePlayerPoints, enrichPlayers } from "../../src/lib/player-derived";

describe("player-derived", () => {
  it("houdt Mbappé tijdelijk op 0 totdat WKCoach echte punten levert", () => {
    const mbappe = derivePlayerPoints({ id: "237", naam: "Kylian Mbappé", club: "Frankrijk", positie: "FWD", prijs: 15 });
    const other = derivePlayerPoints({ id: "88", naam: "B", club: "AJA", positie: "FWD", prijs: 2 });

    expect(mbappe).toBe(0);
    expect(other).toBe(0);
  });

  it("respecteert expliciete punten uit data, ook als dat 0 is", () => {
    expect(derivePlayerPoints({ id: "237", naam: "Kylian Mbappé", club: "Frankrijk", positie: "FWD", prijs: 15, punten: 0 })).toBe(0);
    expect(derivePlayerPoints({ id: "10", naam: "Speler X", club: "Mexico", positie: "MID", prijs: 8, punten: 6 })).toBe(6);
  });

  it("enriches each player with derived punten", () => {
    const players = enrichPlayers([
      { id: "237", naam: "Kylian Mbappé", club: "Frankrijk", positie: "FWD", prijs: 15 },
      { id: "1", naam: "A", club: "PSV", positie: "GK", prijs: 1, punten: 3 },
    ]);
    expect(players[0].punten).toBe(0);
    expect(players[1].punten).toBe(3);
  });
});

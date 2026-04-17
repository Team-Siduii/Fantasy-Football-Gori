import { beforeEach, describe, expect, it } from "vitest";
import { clearPlayers, listPlayers, replacePlayers } from "../../src/lib/player-store";

describe("player-store", () => {
  beforeEach(() => {
    clearPlayers();
  });

  it("stores parsed players", () => {
    replacePlayers([
      { id: "1", naam: "Hancko", club: "Feyenoord", positie: "DEF", prijs: 7.5 },
      { id: "2", naam: "Taylor", club: "Ajax", positie: "MID", prijs: 8.0 },
    ]);

    expect(listPlayers()).toHaveLength(2);
    expect(listPlayers()[1].naam).toBe("Taylor");
  });

  it("clears players", () => {
    replacePlayers([{ id: "1", naam: "Hancko", club: "Feyenoord", positie: "DEF", prijs: 7.5 }]);

    clearPlayers();

    expect(listPlayers()).toHaveLength(0);
  });
});

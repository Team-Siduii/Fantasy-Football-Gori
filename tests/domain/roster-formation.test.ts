import { describe, expect, it } from "vitest";
import { resolveCompatibleFormation } from "../../src/domain/roster-formation";

describe("resolveCompatibleFormation", () => {
  it("keeps the preferred formation when the saved squad still fits", () => {
    const formation = resolveCompatibleFormation({
      preferredFormation: "4-3-3",
      playerPositions: ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "FWD"],
      vacancyCount: 0,
    });

    expect(formation).toBe("4-3-3");
  });

  it("switches Johan-style squads from 4-3-3 to a fitting 4-4-2", () => {
    const formation = resolveCompatibleFormation({
      preferredFormation: "4-3-3",
      playerPositions: ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"],
      vacancyCount: 0,
    });

    expect(formation).toBe("4-4-2");
  });

  it("switches Jack-style squads from 3-5-2 to a fitting 5-3-2", () => {
    const formation = resolveCompatibleFormation({
      preferredFormation: "3-5-2",
      playerPositions: ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"],
      vacancyCount: 0,
    });

    expect(formation).toBe("5-3-2");
  });

  it("switches Ice-style squads from 4-3-3 to a fitting 3-4-3", () => {
    const formation = resolveCompatibleFormation({
      preferredFormation: "4-3-3",
      playerPositions: ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "FWD"],
      vacancyCount: 0,
    });

    expect(formation).toBe("3-4-3");
  });
});

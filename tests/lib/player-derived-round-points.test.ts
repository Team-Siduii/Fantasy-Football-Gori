import { describe, expect, it } from "vitest";

import { getPlayerRoundPoints, getPlayerTotalPoints } from "../../src/lib/player-derived";

describe("player-derived round/total helpers", () => {
  it("prefers explicit roundPoints for team badges", () => {
    expect(getPlayerRoundPoints({ punten: 18, roundPoints: 0 })).toBe(0);
    expect(getPlayerRoundPoints({ punten: 18, roundPoints: 4 })).toBe(4);
  });

  it("prefers explicit totalPoints for cumulative totals", () => {
    expect(getPlayerTotalPoints({ punten: 0, totalPoints: 18 })).toBe(18);
    expect(getPlayerTotalPoints({ punten: 7 })).toBe(7);
  });
});

import { describe, expect, it } from "vitest";
import {
  MAX_TRANSFER_BUDGET_MILLIONS,
  calculateRemainingBudget,
  calculateSquadCost,
  isWithinBudget,
} from "../../src/domain/team-budget";

describe("team-budget", () => {
  it("calculates squad cost once per unique player id", () => {
    const cost = calculateSquadCost([
      { id: "1", prijs: 2.5 },
      { id: "2", prijs: 3 },
      { id: "1", prijs: 2.5 },
    ]);

    expect(cost).toBe(5.5);
  });

  it("calculates remaining budget against 100M cap", () => {
    const remaining = calculateRemainingBudget([
      { id: "1", prijs: 12 },
      { id: "2", prijs: 9 },
      { id: "3", prijs: 8 },
    ]);

    expect(remaining).toBe(71);
    expect(isWithinBudget([{ id: "1", prijs: 99.9 }], MAX_TRANSFER_BUDGET_MILLIONS)).toBe(true);
    expect(isWithinBudget([{ id: "1", prijs: 100.1 }], MAX_TRANSFER_BUDGET_MILLIONS)).toBe(false);
  });
});

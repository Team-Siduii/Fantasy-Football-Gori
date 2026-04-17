import { describe, expect, it } from "vitest";
import {
  buildDraftPickSequence,
  canOpenManagerTradeWindow,
  getTransferLimitForRound,
  validateManagerTradeBudget,
} from "../../src/domain/rules";

describe("buildDraftPickSequence", () => {
  it("builds the required A,A,reverse(A) draft cycle", () => {
    const teams = ["A", "B", "C"];

    expect(buildDraftPickSequence(teams, 9)).toEqual([
      "A",
      "B",
      "C",
      "A",
      "B",
      "C",
      "C",
      "B",
      "A",
    ]);
  });
});

describe("getTransferLimitForRound", () => {
  it("returns limit 3 for configured bonus rounds and 1 otherwise", () => {
    const bonusRounds = [5, 12, 25];

    expect(getTransferLimitForRound(5, bonusRounds)).toBe(3);
    expect(getTransferLimitForRound(6, bonusRounds)).toBe(1);
  });
});

describe("canOpenManagerTradeWindow", () => {
  it("allows manager trade only from draft completion until first match start", () => {
    const draftCompletedAt = new Date("2026-08-01T18:00:00.000Z");
    const firstMatchStartAt = new Date("2026-08-10T18:00:00.000Z");

    expect(
      canOpenManagerTradeWindow(new Date("2026-08-01T18:00:00.000Z"), draftCompletedAt, firstMatchStartAt),
    ).toBe(true);
    expect(
      canOpenManagerTradeWindow(new Date("2026-08-09T18:00:00.000Z"), draftCompletedAt, firstMatchStartAt),
    ).toBe(true);
    expect(
      canOpenManagerTradeWindow(new Date("2026-08-10T18:00:00.000Z"), draftCompletedAt, firstMatchStartAt),
    ).toBe(false);
  });
});

describe("validateManagerTradeBudget", () => {
  it("rejects package trade when one side would go negative", () => {
    const teamA = { budgetRemaining: 2, outgoingTotalPrice: 5, incomingTotalPrice: 10 };
    const teamB = { budgetRemaining: 15, outgoingTotalPrice: 10, incomingTotalPrice: 5 };

    const result = validateManagerTradeBudget(teamA, teamB);

    expect(result.isValid).toBe(false);
    expect(result.teamAAfter).toBe(-3);
    expect(result.teamBAfter).toBe(20);
  });

  it("accepts package trade when both sides stay >= 0", () => {
    const teamA = { budgetRemaining: 8, outgoingTotalPrice: 10, incomingTotalPrice: 12 };
    const teamB = { budgetRemaining: 4, outgoingTotalPrice: 12, incomingTotalPrice: 10 };

    const result = validateManagerTradeBudget(teamA, teamB);

    expect(result.isValid).toBe(true);
    expect(result.teamAAfter).toBe(6);
    expect(result.teamBAfter).toBe(6);
  });
});

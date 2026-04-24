import { describe, expect, it } from "vitest";
import { createDefaultRuleSetV1 } from "../../src/domain/ruleset";
import { evaluateTransferPolicy } from "../../src/domain/transfer-policy";

describe("transfer policy layer", () => {
  it("enforces buy-first after one open sell in normal rounds", () => {
    const ruleset = createDefaultRuleSetV1();

    const decision = evaluateTransferPolicy(ruleset, {
      roundNumber: 6,
      completedTransfers: 0,
      openSells: 1,
    });

    expect(decision.transferLimit).toBe(1);
    expect(decision.sell.allowed).toBe(false);
    expect(decision.buy.allowed).toBe(true);
  });

  it("allows up to 3 open sells first in configured bonus rounds", () => {
    const ruleset = createDefaultRuleSetV1();

    const atTwoOpenSells = evaluateTransferPolicy(ruleset, {
      roundNumber: 5,
      completedTransfers: 0,
      openSells: 2,
    });
    const atLimit = evaluateTransferPolicy(ruleset, {
      roundNumber: 5,
      completedTransfers: 0,
      openSells: 3,
    });

    expect(atTwoOpenSells.transferLimit).toBe(3);
    expect(atTwoOpenSells.sell.allowed).toBe(true);
    expect(atLimit.sell.allowed).toBe(false);
    expect(atLimit.buy.allowed).toBe(true);
  });

  it("blocks all new actions when round limit already exhausted", () => {
    const ruleset = createDefaultRuleSetV1();

    const decision = evaluateTransferPolicy(ruleset, {
      roundNumber: 20,
      completedTransfers: 3,
      openSells: 0,
    });

    expect(decision.transferLimit).toBe(3);
    expect(decision.sell.allowed).toBe(false);
    expect(decision.buy.allowed).toBe(false);
  });
});

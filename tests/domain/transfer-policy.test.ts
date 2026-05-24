import { describe, expect, it } from "vitest";
import {
  createDefaultRuleProfile,
  createFantasyCalcioRuleProfile,
  createLegacyRuleSetV1,
  migrateRuleSetV1ToRuleProfile,
} from "../../src/domain/ruleset";
import { evaluateTransferPolicy } from "../../src/domain/transfer-policy";

describe("transfer policy layer", () => {
  it("enforces buy-first after one open sell in normal rounds for default profile", () => {
    const ruleset = createDefaultRuleProfile();

    const decision = evaluateTransferPolicy(ruleset, {
      roundNumber: 6,
      completedTransfers: 0,
      openSells: 1,
    });

    expect(decision.transferLimit).toBe(1);
    expect(decision.sell.allowed).toBe(false);
    expect(decision.buy.allowed).toBe(true);
  });

  it("allows up to configured open sells in configured bonus rounds", () => {
    const ruleset = createDefaultRuleProfile();

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

  it("respects fantasycalcio preset defaults", () => {
    const ruleset = createFantasyCalcioRuleProfile();

    const decision = evaluateTransferPolicy(ruleset, {
      roundNumber: 8,
      completedTransfers: 0,
      openSells: 1,
    });

    expect(decision.transferLimit).toBe(2);
    expect(decision.sell.allowed).toBe(true);
    expect(decision.buy.allowed).toBe(true);
  });

  it("supports legacy rules via migration", () => {
    const legacy = createLegacyRuleSetV1();
    const migrated = migrateRuleSetV1ToRuleProfile(legacy);

    const decision = evaluateTransferPolicy(migrated, {
      roundNumber: 20,
      completedTransfers: 3,
      openSells: 0,
    });

    expect(decision.transferLimit).toBe(3);
    expect(decision.sell.allowed).toBe(false);
    expect(decision.buy.allowed).toBe(false);
  });
});

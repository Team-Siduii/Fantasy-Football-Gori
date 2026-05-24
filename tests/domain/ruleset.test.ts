import { describe, expect, it } from "vitest";
import {
  createDefaultRuleProfile,
  createFantasyCalcioRuleProfile,
  createLegacyRuleSetV1,
  migrateRuleSetV1ToRuleProfile,
  validateRuleProfile,
} from "../../src/domain/ruleset";

describe("ruleset rule-profile v2", () => {
  it("builds a valid default Eredivisie profile", () => {
    const profile = createDefaultRuleProfile();
    const result = validateRuleProfile(profile);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.normalized?.version).toBe("2.0");
    expect(result.normalized?.id).toBe("eredivisie");
  });

  it("supports a fantasycalcio preset with different transfer configuration", () => {
    const profile = createFantasyCalcioRuleProfile();
    const result = validateRuleProfile(profile);

    expect(result.isValid).toBe(true);
    expect(profile.transfer.defaultPerRound).toBe(2);
    expect(profile.transfer.bonusRounds?.[0]).toEqual({ round: 10, limit: 4 });
  });

  it("rejects invalid bonus-round entries", () => {
    const invalid = {
      ...createDefaultRuleProfile(),
      transfer: {
        ...createDefaultRuleProfile().transfer,
        bonusRounds: [{ round: 0, limit: 3 }],
      },
    };

    const result = validateRuleProfile(invalid);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("transfer.bonusRounds entries must use positive round and positive limit");
  });

  it("migrates legacy RuleSet v1 into v2 profile", () => {
    const legacy = createLegacyRuleSetV1();
    const migrated = migrateRuleSetV1ToRuleProfile(legacy, "eredivisie");
    const result = validateRuleProfile(migrated);

    expect(result.isValid).toBe(true);
    expect(migrated.version).toBe("2.0");
    expect(migrated.transfer.defaultPerRound).toBe(legacy.config.transfer.defaultLimit);
    expect(migrated.transfer.allowMultiSell).toBe(legacy.config.transfer.allowMultipleSellsInBonusRound);
    expect(migrated.squad.budgetCap).toBe(legacy.config.budget.teamValueCapMillions);
  });
});

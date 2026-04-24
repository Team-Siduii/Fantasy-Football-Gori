import { describe, expect, it } from "vitest";
import { createDefaultRuleSetV1, validateRuleSetV1 } from "../../src/domain/ruleset";

describe("ruleset v1", () => {
  it("builds a valid default ruleset", () => {
    const ruleset = createDefaultRuleSetV1();
    const result = validateRuleSetV1(ruleset);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.normalized?.version).toBe("1.0");
  });

  it("rejects bonus rounds that are not exactly 3 unique positive round numbers", () => {
    const invalid = {
      version: "1.0",
      config: {
        transfer: {
          defaultLimit: 1,
          bonusRoundLimit: 3,
          bonusRounds: [5, 5, -1],
          allowMultipleSellsInBonusRound: true,
        },
        budget: { teamValueCapMillions: 32 },
        bench: { composition: { GK: 1, DEF: 1, MID: 1, FWD: 1 } },
      },
    };

    const result = validateRuleSetV1(invalid);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("config.transfer.bonusRounds must contain exactly 3 unique positive round numbers");
  });
});

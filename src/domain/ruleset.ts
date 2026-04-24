export type RuleSetVersion = "1.0";

export type RuleSetV1 = {
  version: RuleSetVersion;
  config: {
    transfer: {
      defaultLimit: number;
      bonusRoundLimit: number;
      bonusRounds: number[];
      allowMultipleSellsInBonusRound: boolean;
    };
    budget: {
      teamValueCapMillions: number;
    };
    bench: {
      composition: {
        GK: number;
        DEF: number;
        MID: number;
        FWD: number;
      };
    };
  };
};

export type RuleSetValidationResult = {
  isValid: boolean;
  errors: string[];
  normalized?: RuleSetV1;
};

export function createDefaultRuleSetV1(): RuleSetV1 {
  return {
    version: "1.0",
    config: {
      transfer: {
        defaultLimit: 1,
        bonusRoundLimit: 3,
        bonusRounds: [5, 10, 20],
        allowMultipleSellsInBonusRound: true,
      },
      budget: {
        teamValueCapMillions: 32,
      },
      bench: {
        composition: {
          GK: 1,
          DEF: 1,
          MID: 1,
          FWD: 1,
        },
      },
    },
  };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateRuleSetV1(input: unknown): RuleSetValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return { isValid: false, errors: ["ruleset must be an object"] };
  }

  const candidate = input as Partial<RuleSetV1>;

  if (candidate.version !== "1.0") {
    errors.push("version must be '1.0'");
  }

  const transfer = candidate.config?.transfer;
  const budget = candidate.config?.budget;
  const bench = candidate.config?.bench;

  if (!transfer || transfer.defaultLimit !== 1) {
    errors.push("config.transfer.defaultLimit must be 1");
  }

  if (!transfer || transfer.bonusRoundLimit !== 3) {
    errors.push("config.transfer.bonusRoundLimit must be 3");
  }

  const bonusRounds = transfer?.bonusRounds;
  if (!Array.isArray(bonusRounds)) {
    errors.push("config.transfer.bonusRounds must be an array");
  } else {
    const valid = bonusRounds.every((round) => isPositiveInteger(round));
    const unique = new Set(bonusRounds).size === bonusRounds.length;
    if (!valid || !unique || bonusRounds.length !== 3) {
      errors.push("config.transfer.bonusRounds must contain exactly 3 unique positive round numbers");
    }
  }

  if (!transfer || typeof transfer.allowMultipleSellsInBonusRound !== "boolean") {
    errors.push("config.transfer.allowMultipleSellsInBonusRound must be a boolean");
  }

  if (!budget || typeof budget.teamValueCapMillions !== "number" || budget.teamValueCapMillions <= 0) {
    errors.push("config.budget.teamValueCapMillions must be a positive number");
  }

  const composition = bench?.composition;
  if (
    !composition ||
    composition.GK !== 1 ||
    composition.DEF !== 1 ||
    composition.MID !== 1 ||
    composition.FWD !== 1
  ) {
    errors.push("config.bench.composition must be { GK:1, DEF:1, MID:1, FWD:1 }");
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors,
    normalized: candidate as RuleSetV1,
  };
}

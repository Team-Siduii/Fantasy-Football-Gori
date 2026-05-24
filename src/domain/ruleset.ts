export type RuleProfileId = "eredivisie" | "fantasycalcio" | "custom";
export type RuleProfileVersion = "2.0";

export type LegacyRuleSetV1 = {
  version: "1.0";
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

export type RuleProfile = {
  id: RuleProfileId;
  version: RuleProfileVersion;
  transfer: {
    mode: "sell-then-buy" | "free-order";
    defaultPerRound: number;
    bonusRounds?: Array<{ round: number; limit: number }>;
    allowMultiSell: boolean;
  };
  squad: {
    budgetCap: number;
    benchComposition?: { GK: number; DEF: number; MID: number; FWD: number };
  };
  roundLock: {
    lockDeadlineMode: "manual" | "kickoff";
    allowAdminOverride: boolean;
  };
};

export type RuleProfileValidationResult = {
  isValid: boolean;
  errors: string[];
  normalized?: RuleProfile;
};

export function createLegacyRuleSetV1(): LegacyRuleSetV1 {
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
        teamValueCapMillions: 100,
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

export function createDefaultRuleProfile(): RuleProfile {
  return {
    id: "eredivisie",
    version: "2.0",
    transfer: {
      mode: "sell-then-buy",
      defaultPerRound: 1,
      bonusRounds: [
        { round: 5, limit: 3 },
        { round: 10, limit: 3 },
        { round: 20, limit: 3 },
      ],
      allowMultiSell: true,
    },
    squad: {
      budgetCap: 100,
      benchComposition: { GK: 1, DEF: 1, MID: 1, FWD: 1 },
    },
    roundLock: {
      lockDeadlineMode: "kickoff",
      allowAdminOverride: true,
    },
  };
}

export function createFantasyCalcioRuleProfile(): RuleProfile {
  return {
    id: "fantasycalcio",
    version: "2.0",
    transfer: {
      mode: "sell-then-buy",
      defaultPerRound: 2,
      bonusRounds: [
        { round: 10, limit: 4 },
        { round: 20, limit: 4 },
      ],
      allowMultiSell: true,
    },
    squad: {
      budgetCap: 100,
      benchComposition: { GK: 1, DEF: 1, MID: 1, FWD: 1 },
    },
    roundLock: {
      lockDeadlineMode: "kickoff",
      allowAdminOverride: true,
    },
  };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateRuleProfile(input: unknown): RuleProfileValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return { isValid: false, errors: ["rule profile must be an object"] };
  }

  const candidate = input as Partial<RuleProfile>;

  if (!candidate.version || candidate.version !== "2.0") {
    errors.push("version must be '2.0'");
  }

  if (!candidate.id || !["eredivisie", "fantasycalcio", "custom"].includes(candidate.id)) {
    errors.push("id must be one of: eredivisie, fantasycalcio, custom");
  }

  if (!candidate.transfer || !isPositiveInteger(candidate.transfer.defaultPerRound)) {
    errors.push("transfer.defaultPerRound must be a positive integer");
  }

  if (!candidate.transfer || typeof candidate.transfer.allowMultiSell !== "boolean") {
    errors.push("transfer.allowMultiSell must be a boolean");
  }

  if (!candidate.transfer || !["sell-then-buy", "free-order"].includes(candidate.transfer.mode ?? "")) {
    errors.push("transfer.mode must be 'sell-then-buy' or 'free-order'");
  }

  if (candidate.transfer?.bonusRounds) {
    const entries = candidate.transfer.bonusRounds;
    const validEntries = entries.every((it) => isPositiveInteger(it.round) && isPositiveInteger(it.limit));
    if (!validEntries) {
      errors.push("transfer.bonusRounds entries must use positive round and positive limit");
    }
    const uniqueRounds = new Set(entries.map((it) => it.round)).size === entries.length;
    if (!uniqueRounds) {
      errors.push("transfer.bonusRounds must not contain duplicate rounds");
    }
  }

  if (!candidate.squad || typeof candidate.squad.budgetCap !== "number" || candidate.squad.budgetCap <= 0) {
    errors.push("squad.budgetCap must be a positive number");
  }

  if (!candidate.roundLock || !["manual", "kickoff"].includes(candidate.roundLock.lockDeadlineMode ?? "")) {
    errors.push("roundLock.lockDeadlineMode must be 'manual' or 'kickoff'");
  }

  if (!candidate.roundLock || typeof candidate.roundLock.allowAdminOverride !== "boolean") {
    errors.push("roundLock.allowAdminOverride must be a boolean");
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors,
    normalized: candidate as RuleProfile,
  };
}

export function migrateRuleSetV1ToRuleProfile(legacy: LegacyRuleSetV1, profileId: RuleProfileId = "custom"): RuleProfile {
  return {
    id: profileId,
    version: "2.0",
    transfer: {
      mode: "sell-then-buy",
      defaultPerRound: legacy.config.transfer.defaultLimit,
      bonusRounds: legacy.config.transfer.bonusRounds.map((round) => ({
        round,
        limit: legacy.config.transfer.bonusRoundLimit,
      })),
      allowMultiSell: legacy.config.transfer.allowMultipleSellsInBonusRound,
    },
    squad: {
      budgetCap: legacy.config.budget.teamValueCapMillions,
      benchComposition: legacy.config.bench.composition,
    },
    roundLock: {
      lockDeadlineMode: "kickoff",
      allowAdminOverride: true,
    },
  };
}

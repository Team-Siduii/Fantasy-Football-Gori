import type { RuleSetV1 } from "./ruleset";

export type TransferPolicyContext = {
  roundNumber: number;
  completedTransfers: number;
  openSells: number;
};

export type TransferPolicyDecision = {
  transferLimit: number;
  sell: {
    allowed: boolean;
    maxOpenSellsRemaining: number;
    reason?: string;
  };
  buy: {
    allowed: boolean;
    reason?: string;
  };
};

function getTransferLimit(ruleset: RuleSetV1, roundNumber: number): number {
  return ruleset.config.transfer.bonusRounds.includes(roundNumber)
    ? ruleset.config.transfer.bonusRoundLimit
    : ruleset.config.transfer.defaultLimit;
}

export function evaluateTransferPolicy(ruleset: RuleSetV1, context: TransferPolicyContext): TransferPolicyDecision {
  const transferLimit = getTransferLimit(ruleset, context.roundNumber);
  const totalReserved = context.completedTransfers + context.openSells;
  const isBonusRound = ruleset.config.transfer.bonusRounds.includes(context.roundNumber);

  const maxOpenSells = isBonusRound && ruleset.config.transfer.allowMultipleSellsInBonusRound ? transferLimit : 1;
  const maxOpenSellsRemaining = Math.max(0, maxOpenSells - context.openSells);

  const sellAllowed = totalReserved < transferLimit && context.openSells < maxOpenSells;
  const buyAllowed = context.openSells > 0 && context.completedTransfers < transferLimit;

  return {
    transferLimit,
    sell: {
      allowed: sellAllowed,
      maxOpenSellsRemaining,
      reason: sellAllowed
        ? undefined
        : totalReserved >= transferLimit
          ? "transfer limit reached for this round"
          : "open sell limit reached, complete buy first",
    },
    buy: {
      allowed: buyAllowed,
      reason: buyAllowed
        ? undefined
        : context.openSells === 0
          ? "select an outgoing player first"
          : "transfer limit reached for this round",
    },
  };
}

import type { RuleProfile } from "./ruleset";

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

function getTransferLimit(profile: RuleProfile, roundNumber: number): number {
  const hit = profile.transfer.bonusRounds?.find((bonus) => bonus.round === roundNumber);
  return hit?.limit ?? profile.transfer.defaultPerRound;
}

export function evaluateTransferPolicy(profile: RuleProfile, context: TransferPolicyContext): TransferPolicyDecision {
  const transferLimit = getTransferLimit(profile, context.roundNumber);
  const totalReserved = context.completedTransfers + context.openSells;

  const maxOpenSells = profile.transfer.allowMultiSell ? transferLimit : 1;
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

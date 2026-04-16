export type TeamTradeBudgetInput = {
  budgetRemaining: number;
  outgoingTotalPrice: number;
  incomingTotalPrice: number;
};

export type ManagerTradeBudgetValidation = {
  teamAAfter: number;
  teamBAfter: number;
  isValid: boolean;
};

export function buildDraftPickSequence(teamOrder: string[], totalPicks: number): string[] {
  if (teamOrder.length === 0 || totalPicks <= 0) {
    return [];
  }

  const forward = [...teamOrder];
  const reverse = [...teamOrder].reverse();
  const rounds = [forward, forward, reverse];

  const sequence: string[] = [];
  let roundIndex = 0;

  while (sequence.length < totalPicks) {
    const currentRound = rounds[roundIndex % rounds.length];

    for (const teamId of currentRound) {
      if (sequence.length >= totalPicks) {
        break;
      }

      sequence.push(teamId);
    }

    roundIndex += 1;
  }

  return sequence;
}

export function getTransferLimitForRound(roundNumber: number, bonusRounds: number[]): number {
  return bonusRounds.includes(roundNumber) ? 3 : 1;
}

export function canOpenManagerTradeWindow(
  now: Date,
  draftCompletedAt: Date,
  firstMatchStartAt: Date,
): boolean {
  return now >= draftCompletedAt && now < firstMatchStartAt;
}

export function validateManagerTradeBudget(
  teamA: TeamTradeBudgetInput,
  teamB: TeamTradeBudgetInput,
): ManagerTradeBudgetValidation {
  const teamAAfter = teamA.budgetRemaining + teamA.outgoingTotalPrice - teamA.incomingTotalPrice;
  const teamBAfter = teamB.budgetRemaining + teamB.outgoingTotalPrice - teamB.incomingTotalPrice;

  return {
    teamAAfter,
    teamBAfter,
    isValid: teamAAfter >= 0 && teamBAfter >= 0,
  };
}

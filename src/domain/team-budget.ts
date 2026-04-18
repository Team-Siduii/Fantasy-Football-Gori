export const MAX_TRANSFER_BUDGET_MILLIONS = 32;

type BudgetPlayer = {
  id: string;
  prijs: number;
};

export function calculateSquadCost(players: BudgetPlayer[]): number {
  const seen = new Set<string>();
  let total = 0;

  for (const player of players) {
    if (!player?.id || seen.has(player.id)) {
      continue;
    }

    seen.add(player.id);
    total += player.prijs;
  }

  return Number(total.toFixed(2));
}

export function calculateRemainingBudget(players: BudgetPlayer[], budgetCap = MAX_TRANSFER_BUDGET_MILLIONS): number {
  const spent = calculateSquadCost(players);
  return Number((budgetCap - spent).toFixed(2));
}

export function isWithinBudget(players: BudgetPlayer[], budgetCap = MAX_TRANSFER_BUDGET_MILLIONS): boolean {
  return calculateSquadCost(players) <= budgetCap;
}

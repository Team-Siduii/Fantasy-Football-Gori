export function shouldShowWkAdvancementBadge(selectedRound: number | null | undefined, advancementPoints: number | null | undefined) {
  return (advancementPoints ?? 0) > 0 && selectedRound != null && selectedRound >= 3;
}

export const WK_SHARED_FINAL_ROUND = 8;
export const WK_LEGACY_FINAL_ROUND = 9;

export function normalizeWkCompetitionRound(round: number | null | undefined): number {
  if (!Number.isFinite(round) || (round ?? 0) <= 0) {
    return 0;
  }
  return Number(round) >= WK_LEGACY_FINAL_ROUND ? WK_SHARED_FINAL_ROUND : Number(round);
}

export function expandWkCompetitionRoundForRawReads(round: number | null | undefined): number | null {
  if (!Number.isFinite(round) || (round ?? 0) <= 0) {
    return null;
  }
  return Number(round) >= WK_SHARED_FINAL_ROUND ? WK_LEGACY_FINAL_ROUND : Number(round);
}

export function normalizeWkTeamName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .toLowerCase();
}

export function isPlaceholderKnockoutLabel(value: string | null | undefined): boolean {
  const normalized = normalizeWkTeamName(value);
  return normalized.startsWith("winnaar duel") || normalized.startsWith("verliezer duel") || normalized.startsWith("nummer ");
}

import type { MvpConfig } from "@/domain/mvp-snapshot";

export const mockLeagueConfig: MvpConfig = {
  currentRound: 5,
  bonusRounds: [5, 10, 20],
  draftCompletedAt: new Date("2026-08-01T12:00:00.000Z"),
  firstCompetitionMatchAt: new Date("2026-08-10T12:00:00.000Z"),
};

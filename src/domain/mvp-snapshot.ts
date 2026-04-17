import { canOpenManagerTradeWindow, getTransferLimitForRound } from "./rules";

export type MvpConfig = {
  currentRound: number;
  bonusRounds: number[];
  draftCompletedAt: Date;
  firstCompetitionMatchAt: Date;
};

export type MvpSnapshot = {
  managerTradeWindow: {
    isOpen: boolean;
    opensAt: string;
    closesAt: string;
  };
  currentRoundTransferLimit: number;
  freePoolRetryPolicy: {
    maxRetries: 3;
    intervalSeconds: 60;
    alertAfterExhausted: true;
  };
  notifications: ["draft_turn", "draft_player_returned_to_pool"];
};

export function buildMvpSnapshot(config: MvpConfig, now: Date): MvpSnapshot {
  return {
    managerTradeWindow: {
      isOpen: canOpenManagerTradeWindow(now, config.draftCompletedAt, config.firstCompetitionMatchAt),
      opensAt: config.draftCompletedAt.toISOString(),
      closesAt: config.firstCompetitionMatchAt.toISOString(),
    },
    currentRoundTransferLimit: getTransferLimitForRound(config.currentRound, config.bonusRounds),
    freePoolRetryPolicy: {
      maxRetries: 3,
      intervalSeconds: 60,
      alertAfterExhausted: true,
    },
    notifications: ["draft_turn", "draft_player_returned_to_pool"],
  };
}

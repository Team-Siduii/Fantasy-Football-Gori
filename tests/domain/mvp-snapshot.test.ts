import { describe, expect, it } from "vitest";
import { buildMvpSnapshot } from "../../src/domain/mvp-snapshot";

describe("buildMvpSnapshot", () => {
  it("returns closed manager trade window at first match start", () => {
    const snapshot = buildMvpSnapshot(
      {
        bonusRounds: [5, 10, 20],
        currentRound: 5,
        draftCompletedAt: new Date("2026-08-01T12:00:00.000Z"),
        firstCompetitionMatchAt: new Date("2026-08-10T12:00:00.000Z"),
      },
      new Date("2026-08-10T12:00:00.000Z"),
    );

    expect(snapshot.managerTradeWindow.isOpen).toBe(false);
    expect(snapshot.currentRoundTransferLimit).toBe(3);
    expect(snapshot.freePoolRetryPolicy.maxRetries).toBe(3);
    expect(snapshot.freePoolRetryPolicy.intervalSeconds).toBe(60);
  });

  it("returns open manager trade window before first match start", () => {
    const snapshot = buildMvpSnapshot(
      {
        bonusRounds: [5, 10, 20],
        currentRound: 6,
        draftCompletedAt: new Date("2026-08-01T12:00:00.000Z"),
        firstCompetitionMatchAt: new Date("2026-08-10T12:00:00.000Z"),
      },
      new Date("2026-08-08T12:00:00.000Z"),
    );

    expect(snapshot.managerTradeWindow.isOpen).toBe(true);
    expect(snapshot.currentRoundTransferLimit).toBe(1);
    expect(snapshot.notifications).toEqual([
      "draft_turn",
      "draft_player_returned_to_pool",
    ]);
  });
});

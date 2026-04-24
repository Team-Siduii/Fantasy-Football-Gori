import { describe, expect, it } from "vitest";
import {
  applyBlindBidReveal,
  cancelWaiverRound,
  createWaiverRound,
  reopenWaiverRound,
  submitBlindBid,
  type WaiverRound,
} from "../../src/domain/waiver-mode";

function withBids(round: WaiverRound) {
  let next = submitBlindBid(round, {
    managerId: "m-2",
    playerId: "p-10",
    amount: 8,
    submittedAt: "2026-04-24T11:00:00.000Z",
  });
  next = submitBlindBid(next, {
    managerId: "m-1",
    playerId: "p-10",
    amount: 8,
    submittedAt: "2026-04-24T10:00:00.000Z",
  });
  return next;
}

describe("waiver blind bid v1", () => {
  it("maakt een open ronde met configuratie", () => {
    const round = createWaiverRound({
      roundNumber: 12,
      tieBreaker: "PRIORITY",
      openedAt: "2026-04-24T09:00:00.000Z",
      revealAt: "2026-04-24T21:00:00.000Z",
    });

    expect(round.status).toBe("OPEN");
    expect(round.tieBreaker).toBe("PRIORITY");
    expect(round.bids).toHaveLength(0);
  });

  it("houdt biedingen gesloten tot reveal en kiest winnaar via priority tiebreak", () => {
    const initial = withBids(
      createWaiverRound({
        roundNumber: 12,
        tieBreaker: "PRIORITY",
        openedAt: "2026-04-24T09:00:00.000Z",
        revealAt: "2026-04-24T21:00:00.000Z",
      }),
    );

    expect(initial.revealedClaims).toHaveLength(0);

    const revealed = applyBlindBidReveal(initial, {
      priorityOrder: ["m-1", "m-2"],
      now: "2026-04-24T21:05:00.000Z",
    });

    expect(revealed.status).toBe("REVEALED");
    expect(revealed.revealedClaims).toHaveLength(1);
    expect(revealed.revealedClaims[0]).toMatchObject({
      playerId: "p-10",
      winnerManagerId: "m-1",
      winningAmount: 8,
    });
  });

  it("admin kan ronde cancelen en heropenen met audit", () => {
    const open = createWaiverRound({
      roundNumber: 7,
      tieBreaker: "EARLIEST_BID",
      openedAt: "2026-04-24T09:00:00.000Z",
      revealAt: "2026-04-24T12:00:00.000Z",
    });

    const cancelled = cancelWaiverRound(open, {
      actorId: "admin-1",
      reason: "Datacorrectie",
      at: "2026-04-24T10:00:00.000Z",
    });

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.auditLog.at(-1)).toMatchObject({
      actionType: "WAIVER_ROUND_CANCELLED",
      actorId: "admin-1",
    });

    const reopened = reopenWaiverRound(cancelled, {
      actorId: "admin-1",
      reason: "Correctie klaar",
      at: "2026-04-24T10:30:00.000Z",
      revealAt: "2026-04-24T13:00:00.000Z",
    });

    expect(reopened.status).toBe("OPEN");
    expect(reopened.revealAt).toBe("2026-04-24T13:00:00.000Z");
    expect(reopened.auditLog.at(-1)).toMatchObject({
      actionType: "WAIVER_ROUND_REOPENED",
      actorId: "admin-1",
    });
  });
});

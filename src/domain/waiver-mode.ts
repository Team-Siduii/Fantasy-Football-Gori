export type WaiverTieBreaker = "PRIORITY" | "EARLIEST_BID";
export type WaiverRoundStatus = "OPEN" | "REVEALED" | "CANCELLED";

export type WaiverBid = {
  managerId: string;
  playerId: string;
  amount: number;
  submittedAt: string;
};

export type WaiverClaimResult = {
  playerId: string;
  winnerManagerId: string;
  winningAmount: number;
};

export type WaiverAuditEntry = {
  actionType: "WAIVER_ROUND_CANCELLED" | "WAIVER_ROUND_REOPENED";
  actorId: string;
  reason: string;
  createdAt: string;
};

export type WaiverRound = {
  roundNumber: number;
  tieBreaker: WaiverTieBreaker;
  openedAt: string;
  revealAt: string;
  status: WaiverRoundStatus;
  bids: WaiverBid[];
  revealedClaims: WaiverClaimResult[];
  auditLog: WaiverAuditEntry[];
};

export function createWaiverRound(input: {
  roundNumber: number;
  tieBreaker: WaiverTieBreaker;
  openedAt: string;
  revealAt: string;
}): WaiverRound {
  return {
    roundNumber: input.roundNumber,
    tieBreaker: input.tieBreaker,
    openedAt: input.openedAt,
    revealAt: input.revealAt,
    status: "OPEN",
    bids: [],
    revealedClaims: [],
    auditLog: [],
  };
}

export function submitBlindBid(round: WaiverRound, bid: WaiverBid): WaiverRound {
  if (round.status !== "OPEN") {
    throw new Error("waiver round is not open");
  }

  return {
    ...round,
    bids: [...round.bids, bid],
  };
}

function sortByTieBreaker(
  bids: WaiverBid[],
  tieBreaker: WaiverTieBreaker,
  priorityIndex: Map<string, number>,
): WaiverBid[] {
  return [...bids].sort((a, b) => {
    if (b.amount !== a.amount) {
      return b.amount - a.amount;
    }

    if (tieBreaker === "PRIORITY") {
      const aRank = priorityIndex.get(a.managerId) ?? Number.MAX_SAFE_INTEGER;
      const bRank = priorityIndex.get(b.managerId) ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) {
        return aRank - bRank;
      }
    }

    return a.submittedAt.localeCompare(b.submittedAt);
  });
}

export function applyBlindBidReveal(
  round: WaiverRound,
  input: { priorityOrder: string[]; now: string },
): WaiverRound {
  if (round.status !== "OPEN") {
    throw new Error("waiver round is not open");
  }

  if (input.now < round.revealAt) {
    throw new Error("reveal time not reached yet");
  }

  const priorityIndex = new Map(input.priorityOrder.map((id, index) => [id, index]));

  const grouped = new Map<string, WaiverBid[]>();
  for (const bid of round.bids) {
    const list = grouped.get(bid.playerId) ?? [];
    list.push(bid);
    grouped.set(bid.playerId, list);
  }

  const claims: WaiverClaimResult[] = [];
  for (const [playerId, bids] of grouped.entries()) {
    const ordered = sortByTieBreaker(bids, round.tieBreaker, priorityIndex);
    const winner = ordered[0];
    claims.push({
      playerId,
      winnerManagerId: winner.managerId,
      winningAmount: winner.amount,
    });
  }

  return {
    ...round,
    status: "REVEALED",
    revealedClaims: claims,
  };
}

export function cancelWaiverRound(
  round: WaiverRound,
  input: { actorId: string; reason: string; at: string },
): WaiverRound {
  return {
    ...round,
    status: "CANCELLED",
    auditLog: [
      ...round.auditLog,
      {
        actionType: "WAIVER_ROUND_CANCELLED",
        actorId: input.actorId,
        reason: input.reason,
        createdAt: input.at,
      },
    ],
  };
}

export function reopenWaiverRound(
  round: WaiverRound,
  input: { actorId: string; reason: string; at: string; revealAt: string },
): WaiverRound {
  return {
    ...round,
    status: "OPEN",
    revealAt: input.revealAt,
    revealedClaims: [],
    auditLog: [
      ...round.auditLog,
      {
        actionType: "WAIVER_ROUND_REOPENED",
        actorId: input.actorId,
        reason: input.reason,
        createdAt: input.at,
      },
    ],
  };
}

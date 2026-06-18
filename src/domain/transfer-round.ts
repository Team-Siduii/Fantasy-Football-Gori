export type TransferRoundPhase = "SELL" | "BUY" | "AWAITING_RETRY" | "COMPLETED";
export type TransferSellStatus = "PENDING" | "SKIPPED" | "SUBMITTED";
export type TransferBuyStatus = "LOCKED" | "PENDING" | "SUBMITTED" | "COMPLETED" | "RETRY_REQUIRED";

export type TransferRoundManagerEntry = {
  managerId: string;
  email: string;
  displayName: string;
  teamName: string;
  subpoule: string;
  rankingPosition: number;
  sellStatus: TransferSellStatus;
  sellPlayerId: string | null;
  /** Spelers die automatisch verkocht zijn (WK verlaten / inactive) */
  autoSellPlayerIds: string[];
  buyStatus: TransferBuyStatus;
  buyPlayerId: string | null;
  /** Tweede koop-slot bij auto-sells */
  extraBuyPlayerId: string | null;
  resolvedTransfer: { soldPlayerId: string; boughtPlayerId: string } | null;
  /** Tweede resolved transfer bij auto-sells */
  extraResolvedTransfer: { soldPlayerId: string; boughtPlayerId: string } | null;
  updatedAt: string | null;
};

export type TransferRoundConflict = {
  playerId: string;
  candidateManagerIds: string[];
  winnerManagerId: string;
  loserManagerIds: string[];
};

export type TransferRoundState = {
  roundNumber: number;
  phase: TransferRoundPhase;
  entries: TransferRoundManagerEntry[];
  conflicts: TransferRoundConflict[];
  updatedAt: string;
};

export type TransferRoundParticipant = Pick<TransferRoundManagerEntry, "managerId" | "email" | "displayName" | "teamName" | "subpoule" | "rankingPosition">;

function cloneEntry(entry: TransferRoundManagerEntry): TransferRoundManagerEntry {
  return {
    ...entry,
    autoSellPlayerIds: [...entry.autoSellPlayerIds],
    resolvedTransfer: entry.resolvedTransfer ? { ...entry.resolvedTransfer } : null,
    extraResolvedTransfer: entry.extraResolvedTransfer ? { ...entry.extraResolvedTransfer } : null,
  };
}

function sortEntries(entries: TransferRoundManagerEntry[]) {
  return [...entries].sort((a, b) => a.rankingPosition - b.rankingPosition || a.teamName.localeCompare(b.teamName));
}

export function createTransferRoundState(roundNumber: number, participants: TransferRoundParticipant[], at?: string): TransferRoundState {
  const now = at ?? new Date().toISOString();
  return {
    roundNumber,
    phase: "SELL",
    conflicts: [],
    updatedAt: now,
    entries: sortEntries(
      participants.map((participant) => ({
        ...participant,
        sellStatus: "PENDING",
        sellPlayerId: null,
        autoSellPlayerIds: [],
        buyStatus: "LOCKED",
        buyPlayerId: null,
        extraBuyPlayerId: null,
        resolvedTransfer: null,
        extraResolvedTransfer: null,
        updatedAt: null,
      })),
    ),
  };
}

export function syncTransferRoundParticipants(
  state: TransferRoundState,
  participants: TransferRoundParticipant[],
  at?: string,
): TransferRoundState {
  const now = at ?? new Date().toISOString();
  const existingByManagerId = new Map(state.entries.map((entry) => [entry.managerId, entry]));
  const existingByEmail = new Map(state.entries.map((entry) => [entry.email.toLowerCase(), entry]));
  const nextEntries = participants.map((participant) => {
    let existing = existingByManagerId.get(participant.managerId);
    if (!existing) {
      // Fallback: match by email — managerId kan verschillen tussen ranking en transfer state
      existing = existingByEmail.get((participant.email ?? "").toLowerCase()) ?? undefined;
    }
    if (!existing) {
      return {
        ...participant,
        sellStatus: "PENDING" as TransferSellStatus,
        sellPlayerId: null,
        autoSellPlayerIds: [],
        buyStatus: "LOCKED" as TransferBuyStatus,
        buyPlayerId: null,
        extraBuyPlayerId: null,
        resolvedTransfer: null,
        extraResolvedTransfer: null,
        updatedAt: null,
      };
    }

    return {
      ...cloneEntry(existing),
      displayName: participant.displayName,
      teamName: participant.teamName,
      email: participant.email,
      subpoule: participant.subpoule,
      rankingPosition: participant.rankingPosition,
    };
  });

  return recomputeTransferRoundState({
    ...state,
    entries: sortEntries(nextEntries),
    updatedAt: now,
  });
}

function getEntryOrThrow(state: TransferRoundState, managerId: string) {
  const entry = state.entries.find((candidate) => candidate.managerId === managerId);
  if (!entry) {
    throw new Error("manager niet gevonden in deze transfergroep");
  }
  return entry;
}

function replaceEntry(state: TransferRoundState, managerId: string, updater: (entry: TransferRoundManagerEntry) => TransferRoundManagerEntry, at?: string) {
  const now = at ?? new Date().toISOString();
  return recomputeTransferRoundState({
    ...state,
    updatedAt: now,
    entries: state.entries.map((entry) => (entry.managerId === managerId ? updater(cloneEntry(entry)) : cloneEntry(entry))),
  });
}

export function getBuyCount(entry: TransferRoundManagerEntry): number {
  let count = entry.autoSellPlayerIds.length;
  if (entry.sellPlayerId) count += 1;
  return count;
}

/**
 * Past auto-sells toe voor inactive spelers die niet al handmatig verkocht zijn.
 */
export function applyAutoSells(
  state: TransferRoundState,
  getInactivePlayerIds: (ids: string[]) => string[],
  getTeamPlayerIds: (managerId: string) => string[],
  at?: string,
): TransferRoundState {
  if (state.phase !== "SELL") return state;

  let next = state;
  for (const entry of next.entries) {
    const teamIds = getTeamPlayerIds(entry.managerId);
    const inactiveIds = getInactivePlayerIds(teamIds);
    if (inactiveIds.length === 0) continue;

    // Filter out IDs die al handmatig verkocht zijn
    const newAutoSells = inactiveIds.filter(
      (id) => id !== entry.sellPlayerId && !entry.autoSellPlayerIds.includes(id),
    );
    if (newAutoSells.length === 0) continue;

    next = replaceEntry(
      next,
      entry.managerId,
      (current) => ({
        ...current,
        autoSellPlayerIds: [...current.autoSellPlayerIds, ...newAutoSells],
        updatedAt: at ?? new Date().toISOString(),
      }),
      at,
    );
  }
  return next;
}

export function submitSellChoice(state: TransferRoundState, managerId: string, sellPlayerId: string, at?: string) {
  const entry = getEntryOrThrow(state, managerId);
  if (state.phase !== "SELL") {
    throw new Error("verkopen is alleen mogelijk in de SELL fase");
  }
  if (!sellPlayerId) {
    throw new Error("speler om te verkopen ontbreekt");
  }

  return replaceEntry(
    state,
    managerId,
    (current) => ({
      ...current,
      sellStatus: "SUBMITTED",
      sellPlayerId,
      buyStatus: "PENDING",
      buyPlayerId: null,
      extraBuyPlayerId: null,
      resolvedTransfer: null,
      extraResolvedTransfer: null,
      updatedAt: at ?? new Date().toISOString(),
    }),
    at,
  );
}

export function skipSellChoice(state: TransferRoundState, managerId: string, at?: string) {
  const entry = getEntryOrThrow(state, managerId);
  if (state.phase !== "SELL") {
    throw new Error("verkopen is alleen mogelijk in de SELL fase");
  }

  return replaceEntry(
    state,
    managerId,
    (current) => ({
      ...current,
      sellStatus: "SKIPPED",
      sellPlayerId: null,
      buyStatus: current.autoSellPlayerIds.length > 0 ? "PENDING" : "LOCKED",
      buyPlayerId: null,
      extraBuyPlayerId: null,
      resolvedTransfer: null,
      extraResolvedTransfer: null,
      updatedAt: at ?? new Date().toISOString(),
    }),
    at,
  );
}

export function submitBuyChoice(
  state: TransferRoundState,
  managerId: string,
  buyPlayerId: string,
  extraBuyPlayerId?: string,
  at?: string,
) {
  const entry = getEntryOrThrow(state, managerId);
  if (!(state.phase === "BUY" || state.phase === "AWAITING_RETRY")) {
    throw new Error("koopfase is nog niet geopend");
  }
  if (!(entry.buyStatus === "PENDING" || entry.buyStatus === "RETRY_REQUIRED")) {
    throw new Error("deze manager hoeft nu geen aankoop te kiezen");
  }
  if (!entry.sellPlayerId && entry.autoSellPlayerIds.length === 0) {
    throw new Error("er is nog geen verkoop geregistreerd");
  }
  if (!buyPlayerId) {
    throw new Error("speler om te kopen ontbreekt");
  }

  return replaceEntry(
    state,
    managerId,
    (current) => ({
      ...current,
      buyStatus: "SUBMITTED",
      buyPlayerId,
      extraBuyPlayerId: extraBuyPlayerId ?? current.extraBuyPlayerId,
      resolvedTransfer: null,
      extraResolvedTransfer: null,
      updatedAt: at ?? new Date().toISOString(),
    }),
    at,
  );
}

function resolveConflicts(entries: TransferRoundManagerEntry[]): TransferRoundConflict[] {
  const groups = new Map<string, TransferRoundManagerEntry[]>();
  for (const entry of entries) {
    if (entry.buyStatus !== "SUBMITTED") continue;
    // Check primary buy slot
    if (entry.buyPlayerId) {
      const current = groups.get(entry.buyPlayerId) ?? [];
      current.push(entry);
      groups.set(entry.buyPlayerId, current);
    }
    // Check extra buy slot
    if (entry.extraBuyPlayerId) {
      const current = groups.get(entry.extraBuyPlayerId) ?? [];
      current.push(entry);
      groups.set(entry.extraBuyPlayerId, current);
    }
  }

  const conflicts: TransferRoundConflict[] = [];
  for (const [playerId, candidates] of groups.entries()) {
    if (candidates.length < 2) {
      continue;
    }
    const ordered = [...candidates].sort(
      (a, b) => b.rankingPosition - a.rankingPosition || a.teamName.localeCompare(b.teamName),
    );
    const winner = ordered[0];
    conflicts.push({
      playerId,
      candidateManagerIds: ordered.map((candidate) => candidate.managerId),
      winnerManagerId: winner.managerId,
      loserManagerIds: ordered.slice(1).map((candidate) => candidate.managerId),
    });
  }

  return conflicts.sort((a, b) => a.playerId.localeCompare(b.playerId));
}

export function resolveSubmittedBuys(state: TransferRoundState, at?: string) {
  const now = at ?? new Date().toISOString();
  const conflicts = resolveConflicts(state.entries);
  const winnerByManagerId = new Map<string, TransferRoundConflict>();
  const loserManagerIds = new Set<string>();
  for (const conflict of conflicts) {
    winnerByManagerId.set(conflict.winnerManagerId, conflict);
    for (const loserId of conflict.loserManagerIds) {
      loserManagerIds.add(loserId);
    }
  }

  const nextEntries: TransferRoundManagerEntry[] = state.entries.map((entry) => {
    const current = cloneEntry(entry);
    if (current.buyStatus !== "SUBMITTED") {
      return current;
    }

    // Determine sold player: handmatige sell of eerste auto-sell
    const soldPlayerId = current.sellPlayerId ?? current.autoSellPlayerIds[0] ?? null;
    const hasBuy = Boolean(current.buyPlayerId);

    if (!hasBuy && !current.extraBuyPlayerId) {
      return current;
    }

    // Check if this manager lost ANY conflict
    const isLoser = loserManagerIds.has(current.managerId);

    if (isLoser) {
      return {
        ...current,
        buyStatus: "RETRY_REQUIRED",
        buyPlayerId: null,
        extraBuyPlayerId: null,
        resolvedTransfer: null,
        extraResolvedTransfer: null,
        updatedAt: now,
      };
    }

    // Determine which auto-sell to pair with extra buy
    const extraSoldPlayerId = current.autoSellPlayerIds.length >= 2
      ? current.autoSellPlayerIds[1]
      : current.autoSellPlayerIds.length === 1 && current.sellPlayerId
        ? current.autoSellPlayerIds[0]
        : null;

    const primaryResolved = hasBuy && soldPlayerId
      ? { soldPlayerId, boughtPlayerId: current.buyPlayerId! }
      : null;

    const extraResolved = current.extraBuyPlayerId && extraSoldPlayerId
      ? { soldPlayerId: extraSoldPlayerId, boughtPlayerId: current.extraBuyPlayerId }
      : null;

    return {
      ...current,
      buyStatus: "COMPLETED",
      resolvedTransfer: primaryResolved,
      extraResolvedTransfer: extraResolved,
      updatedAt: now,
    };
  });

  return recomputeTransferRoundState({
    ...state,
    conflicts,
    entries: nextEntries,
    updatedAt: now,
  });
}

export function recomputeTransferRoundState(state: TransferRoundState): TransferRoundState {
  const allSellChoicesDone = state.entries.every(
    (entry) => entry.sellStatus !== "PENDING" || entry.autoSellPlayerIds.length > 0,
  );
  const buyEntries = state.entries.filter(
    (entry) => entry.sellStatus === "SUBMITTED" || entry.autoSellPlayerIds.length > 0,
  );
  const pendingBuyExists = buyEntries.some((entry) => entry.buyStatus === "PENDING");
  const submittedBuyExists = buyEntries.some((entry) => entry.buyStatus === "SUBMITTED");
  const retryRequiredExists = buyEntries.some((entry) => entry.buyStatus === "RETRY_REQUIRED");
  const allTransferEntriesDone = buyEntries.every(
    (entry) => entry.buyStatus === "COMPLETED" || entry.buyStatus === "LOCKED",
  );

  let phase: TransferRoundPhase = "SELL";
  if (!allSellChoicesDone) {
    phase = "SELL";
  } else if (retryRequiredExists) {
    phase = "AWAITING_RETRY";
  } else if (pendingBuyExists || submittedBuyExists) {
    phase = "BUY";
  } else if (allTransferEntriesDone) {
    phase = "COMPLETED";
  }

  return {
    ...state,
    phase,
    entries: sortEntries(state.entries),
  };
}

export function getPendingManagers(state: TransferRoundState) {
  switch (state.phase) {
    case "SELL":
      return state.entries.filter((entry) => entry.sellStatus === "PENDING");
    case "BUY":
      return state.entries.filter((entry) => entry.buyStatus === "PENDING");
    case "AWAITING_RETRY":
      return state.entries.filter((entry) => entry.buyStatus === "RETRY_REQUIRED");
    case "COMPLETED":
    default:
      return [];
  }
}

export function allRequiredBuyChoicesSubmitted(state: TransferRoundState) {
  const relevant = state.entries.filter((entry) => entry.buyStatus === "PENDING" || entry.buyStatus === "SUBMITTED");
  return relevant.length > 0 && relevant.every((entry) => entry.buyStatus === "SUBMITTED");
}

export function allRetryChoicesSubmitted(state: TransferRoundState) {
  const relevant = state.entries.filter((entry) => entry.buyStatus === "RETRY_REQUIRED" || entry.buyStatus === "SUBMITTED");
  return relevant.length > 0 && relevant.every((entry) => entry.buyStatus === "SUBMITTED");
}

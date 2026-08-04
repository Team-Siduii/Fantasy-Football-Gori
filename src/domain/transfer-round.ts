export type TransferRoundPhase = "SELL" | "BUY" | "AWAITING_RETRY" | "COMPLETED";
export type TransferSellStatus = "PENDING" | "SKIPPED" | "SUBMITTED";
export type TransferBuyStatus = "LOCKED" | "PENDING" | "SUBMITTED" | "COMPLETED" | "RETRY_REQUIRED";

export type ResolvedTransfer = {
  soldPlayerId: string;
  boughtPlayerId: string;
};

export type TransferRoundManagerEntry = {
  managerId: string;
  email: string;
  displayName: string;
  teamName: string;
  subpoule: string;
  rankingPosition: number;
  sellStatus: TransferSellStatus;
  sellPlayerId: string | null;
  autoSellPlayerIds: string[];
  buyStatus: TransferBuyStatus;
  buyPlayerIds: string[];
  buyPlayerId: string | null;
  resolvedTransfers: ResolvedTransfer[];
  resolvedTransfer: ResolvedTransfer | null;
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

export type TransferRoundParticipant = Pick<
  TransferRoundManagerEntry,
  "managerId" | "email" | "displayName" | "teamName" | "subpoule" | "rankingPosition"
>;

function uniqueIds(ids: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function withCompatibilityFields(entry: Omit<TransferRoundManagerEntry, "buyPlayerId" | "resolvedTransfer">): TransferRoundManagerEntry {
  return {
    ...entry,
    buyPlayerId: entry.buyPlayerIds[0] ?? null,
    resolvedTransfer: entry.resolvedTransfers[0] ?? null,
  };
}

function cloneEntry(entry: TransferRoundManagerEntry): TransferRoundManagerEntry {
  return withCompatibilityFields({
    ...entry,
    autoSellPlayerIds: [...(entry.autoSellPlayerIds ?? [])],
    buyPlayerIds: [...(entry.buyPlayerIds ?? [])],
    resolvedTransfers: (entry.resolvedTransfers ?? []).map((transfer) => ({ ...transfer })),
  });
}

function sortEntries(entries: TransferRoundManagerEntry[]) {
  return [...entries].sort((a, b) => a.rankingPosition - b.rankingPosition || a.teamName.localeCompare(b.teamName));
}

export function getSoldPlayerIds(entry: TransferRoundManagerEntry) {
  return uniqueIds([...(entry.sellPlayerId ? [entry.sellPlayerId] : []), ...(entry.autoSellPlayerIds ?? [])]);
}

export function getResolvedSoldPlayerIds(entry: TransferRoundManagerEntry) {
  return new Set((entry.resolvedTransfers ?? []).map((transfer) => transfer.soldPlayerId));
}

export function getUnresolvedSoldPlayerIds(entry: TransferRoundManagerEntry) {
  const resolved = getResolvedSoldPlayerIds(entry);
  return getSoldPlayerIds(entry).filter((playerId) => !resolved.has(playerId));
}

export function getBuyCount(entry: TransferRoundManagerEntry): number {
  return getSoldPlayerIds(entry).length;
}

export function getRemainingBuyCapacity(entry: TransferRoundManagerEntry): number {
  return Math.max(0, getUnresolvedSoldPlayerIds(entry).length);
}

export function createTransferRoundState(
  roundNumber: number,
  participants: TransferRoundParticipant[],
  at?: string,
): TransferRoundState {
  const now = at ?? new Date().toISOString();
  return {
    roundNumber,
    phase: "SELL",
    conflicts: [],
    updatedAt: now,
    entries: sortEntries(
      participants.map((participant) =>
        withCompatibilityFields({
          ...participant,
          sellStatus: "PENDING",
          sellPlayerId: null,
          autoSellPlayerIds: [],
          buyStatus: "LOCKED",
          buyPlayerIds: [],
          resolvedTransfers: [],
          updatedAt: null,
        }),
      ),
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
      existing = existingByEmail.get((participant.email ?? "").toLowerCase()) ?? undefined;
    }
    if (!existing) {
      return withCompatibilityFields({
        ...participant,
        sellStatus: "PENDING",
        sellPlayerId: null,
        autoSellPlayerIds: [],
        buyStatus: "LOCKED",
        buyPlayerIds: [],
        resolvedTransfers: [],
        updatedAt: null,
      });
    }

    return withCompatibilityFields({
      ...cloneEntry(existing),
      displayName: participant.displayName,
      teamName: participant.teamName,
      email: participant.email,
      subpoule: participant.subpoule,
      rankingPosition: participant.rankingPosition,
    });
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

function replaceEntry(
  state: TransferRoundState,
  managerId: string,
  updater: (entry: TransferRoundManagerEntry) => TransferRoundManagerEntry,
  at?: string,
) {
  const now = at ?? new Date().toISOString();
  return recomputeTransferRoundState({
    ...state,
    updatedAt: now,
    entries: state.entries.map((entry) => (entry.managerId === managerId ? withCompatibilityFields(updater(cloneEntry(entry))) : cloneEntry(entry))),
  });
}

export function submitSellChoice(state: TransferRoundState, managerId: string, sellPlayerId: string, at?: string) {
  return submitSellChoices(state, managerId, { sellPlayerId }, at);
}

export function submitSellChoices(
  state: TransferRoundState,
  managerId: string,
  sellChoice: { sellPlayerId: string | null; autoSellPlayerIds?: string[] },
  at?: string,
) {
  if (state.phase !== "SELL") {
    throw new Error("verkopen is alleen mogelijk in de SELL fase");
  }

  const normalizedAutoSellIds = uniqueIds(
    (sellChoice.autoSellPlayerIds ?? []).filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    ),
  );
  const normalizedSellPlayerId =
    typeof sellChoice.sellPlayerId === "string" && sellChoice.sellPlayerId.length > 0 ? sellChoice.sellPlayerId : null;

  if (!normalizedSellPlayerId && normalizedAutoSellIds.length === 0) {
    throw new Error("speler om te verkopen ontbreekt");
  }

  const mergedAutoSellIds = normalizedSellPlayerId
    ? normalizedAutoSellIds.filter((id) => id !== normalizedSellPlayerId)
    : normalizedAutoSellIds;

  return replaceEntry(
    state,
    managerId,
    (current) => {
      const nextEntry = withCompatibilityFields({
        ...current,
        sellStatus: "SUBMITTED",
        sellPlayerId: normalizedSellPlayerId,
        autoSellPlayerIds: uniqueIds([...(current.autoSellPlayerIds ?? []), ...mergedAutoSellIds]),
        buyStatus: "LOCKED",
        buyPlayerIds: [],
        resolvedTransfers: [],
        updatedAt: at ?? new Date().toISOString(),
      });

      return withCompatibilityFields({
        ...nextEntry,
        buyStatus: getBuyCount(nextEntry) > 0 ? "PENDING" : "LOCKED",
      });
    },
    at,
  );
}

export function skipSellChoice(state: TransferRoundState, managerId: string, at?: string) {
  if (state.phase !== "SELL") {
    throw new Error("verkopen is alleen mogelijk in de SELL fase");
  }

  return replaceEntry(
    state,
    managerId,
    (current) =>
      withCompatibilityFields({
        ...current,
        sellStatus: "SKIPPED",
        sellPlayerId: null,
        buyStatus: (current.autoSellPlayerIds ?? []).length > 0 ? "PENDING" : "LOCKED",
        buyPlayerIds: [],
        resolvedTransfers: [],
        updatedAt: at ?? new Date().toISOString(),
      }),
    at,
  );
}

export function submitBuyChoice(
  state: TransferRoundState,
  managerId: string,
  buyPlayerInput: string | string[],
  at?: string,
) {
  const entry = getEntryOrThrow(state, managerId);
  if (!(state.phase === "BUY" || state.phase === "AWAITING_RETRY")) {
    throw new Error("koopfase is nog niet geopend");
  }
  if (!(entry.buyStatus === "PENDING" || entry.buyStatus === "RETRY_REQUIRED" || entry.buyStatus === "SUBMITTED")) {
    throw new Error("deze manager hoeft nu geen aankoop te kiezen");
  }
  if (!entry.sellPlayerId && (entry.autoSellPlayerIds ?? []).length === 0) {
    throw new Error("er is nog geen verkoop geregistreerd");
  }

  const inputIds = Array.isArray(buyPlayerInput) ? buyPlayerInput : [buyPlayerInput];
  const normalized = uniqueIds(inputIds.filter((value): value is string => typeof value === "string" && value.length > 0));
  const remainingCapacity = getRemainingBuyCapacity(entry);
  if (normalized.length > remainingCapacity) {
    throw new Error(`je kunt maximaal ${remainingCapacity} speler${remainingCapacity === 1 ? "" : "s"} kopen in deze stap`);
  }

  return replaceEntry(
    state,
    managerId,
    (current) =>
      withCompatibilityFields({
        ...current,
        buyStatus: "SUBMITTED",
        buyPlayerIds: normalized,
        updatedAt: at ?? new Date().toISOString(),
      }),
    at,
  );
}

type BuyClaim = {
  managerId: string;
  rankingPosition: number;
  playerId: string;
};

function resolveConflicts(entries: TransferRoundManagerEntry[]) {
  const groups = new Map<string, BuyClaim[]>();
  for (const entry of entries) {
    if (entry.buyStatus !== "SUBMITTED") continue;
    for (const playerId of entry.buyPlayerIds ?? []) {
      const current = groups.get(playerId) ?? [];
      current.push({ managerId: entry.managerId, rankingPosition: entry.rankingPosition, playerId });
      groups.set(playerId, current);
    }
  }

  const conflicts: TransferRoundConflict[] = [];
  for (const [playerId, candidates] of Array.from(groups.entries())) {
    if (candidates.length < 2) continue;
    const ordered = [...candidates].sort(
      (a, b) => b.rankingPosition - a.rankingPosition || a.managerId.localeCompare(b.managerId),
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
  const winningManagerByPlayerId = new Map<string, string>();
  const losingManagersByPlayerId = new Map<string, Set<string>>();

  for (const conflict of conflicts) {
    winningManagerByPlayerId.set(conflict.playerId, conflict.winnerManagerId);
    losingManagersByPlayerId.set(conflict.playerId, new Set(conflict.loserManagerIds));
  }

  const nextEntries: TransferRoundManagerEntry[] = state.entries.map((entry) => {
    const current = cloneEntry(entry);
    if (current.buyStatus !== "SUBMITTED") {
      return current;
    }

    const unresolvedSoldIds = getUnresolvedSoldPlayerIds(current);
    const winningBuyIds: string[] = [];
    let lostAny = false;

    for (const playerId of current.buyPlayerIds ?? []) {
      const winnerManagerId = winningManagerByPlayerId.get(playerId);
      if (!winnerManagerId || winnerManagerId === current.managerId) {
        winningBuyIds.push(playerId);
        continue;
      }
      const losers = losingManagersByPlayerId.get(playerId);
      if (losers?.has(current.managerId)) {
        lostAny = true;
      }
    }

    const transferableBuyIds = winningBuyIds.slice(0, unresolvedSoldIds.length);
    const appendedTransfers = transferableBuyIds.map((boughtPlayerId, index) => ({
      soldPlayerId: unresolvedSoldIds[index],
      boughtPlayerId,
    }));

    return withCompatibilityFields({
      ...current,
      buyStatus: lostAny ? "RETRY_REQUIRED" : "COMPLETED",
      buyPlayerIds: [],
      resolvedTransfers: [...(current.resolvedTransfers ?? []), ...appendedTransfers],
      updatedAt: now,
    });
  });

  return recomputeTransferRoundState({
    ...state,
    conflicts,
    entries: nextEntries,
    updatedAt: now,
  });
}

export function finalizeExpiredTransferRound(state: TransferRoundState, at?: string) {
  const now = at ?? new Date().toISOString();
  let nextState = state;

  if (nextState.phase === "BUY" && allRequiredBuyChoicesSubmitted(nextState)) {
    nextState = resolveSubmittedBuys(nextState, now);
  } else if (nextState.phase === "AWAITING_RETRY" && allRetryChoicesSubmitted(nextState)) {
    nextState = resolveSubmittedBuys(nextState, now);
  }

  const nextEntries: TransferRoundManagerEntry[] = nextState.entries.map((entry) => {
    const current = cloneEntry(entry);

    if ((current.resolvedTransfers ?? []).length > 0) {
      return current;
    }

    if (current.sellStatus === "PENDING") {
      return withCompatibilityFields({
        ...current,
        sellStatus: "SKIPPED",
        sellPlayerId: null,
        autoSellPlayerIds: [],
        buyStatus: "LOCKED",
        buyPlayerIds: [],
        resolvedTransfers: [],
        updatedAt: now,
      });
    }

    if (current.sellStatus === "SKIPPED") {
      return withCompatibilityFields({
        ...current,
        buyStatus: "LOCKED",
        buyPlayerIds: [],
        resolvedTransfers: [],
        updatedAt: current.buyStatus === "LOCKED" ? current.updatedAt : now,
      });
    }

    if (current.sellStatus === "SUBMITTED" && current.buyStatus !== "COMPLETED") {
      return withCompatibilityFields({
        ...current,
        buyStatus: "LOCKED",
        buyPlayerIds: [],
        resolvedTransfers: [],
        updatedAt: now,
      });
    }

    return current;
  });

  return recomputeTransferRoundState({
    ...nextState,
    conflicts: nextState.phase === "COMPLETED" ? nextState.conflicts : [],
    entries: nextEntries,
    updatedAt: now,
  });
}

export function recomputeTransferRoundState(state: TransferRoundState): TransferRoundState {
  const allSellChoicesDone = state.entries.every((entry) => entry.sellStatus !== "PENDING");
  const buyEntries = state.entries.filter((entry) => getBuyCount(entry) > 0);
  const pendingBuyExists = buyEntries.some((entry) => entry.buyStatus === "PENDING");
  const submittedBuyExists = buyEntries.some((entry) => entry.buyStatus === "SUBMITTED");
  const retryRequiredExists = buyEntries.some((entry) => entry.buyStatus === "RETRY_REQUIRED");
  const allTransferEntriesDone = buyEntries.every((entry) => entry.buyStatus === "COMPLETED" || entry.buyStatus === "LOCKED");

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
    entries: sortEntries(state.entries).map((entry) => withCompatibilityFields(cloneEntry(entry))),
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

import type { PlayerRecord } from "@/domain/player";

export type TransferState = {
  lineupIds: string[];
  benchIds: string[];
  pendingSellId: string | null;
  pendingBuyId: string | null;
};

function byId(players: PlayerRecord[]) {
  return new Map(players.map((player) => [player.id, player]));
}

export function buildMarketPlayers<T extends PlayerRecord>(players: T[], lineupIds: string[], benchIds: string[]): T[] {
  const squadIds = new Set([...lineupIds, ...benchIds]);
  return players.filter((player) => !squadIds.has(player.id));
}

export function canPickIncomingPlayer(state: TransferState): boolean {
  return Boolean(state.pendingSellId);
}

export function applyConfirmedTransfer(state: TransferState, allPlayers: PlayerRecord[]): TransferState {
  if (!state.pendingSellId || !state.pendingBuyId || state.pendingSellId === state.pendingBuyId) {
    return state;
  }

  const players = byId(allPlayers);
  const outgoing = players.get(state.pendingSellId);
  const incoming = players.get(state.pendingBuyId);

  if (!outgoing || !incoming || outgoing.positie !== incoming.positie) {
    return state;
  }

  const lineupIndex = state.lineupIds.indexOf(state.pendingSellId);
  const benchIndex = state.benchIds.indexOf(state.pendingSellId);

  if (lineupIndex === -1 && benchIndex === -1) {
    return state;
  }

  const nextLineup = [...state.lineupIds];
  const nextBench = [...state.benchIds];

  if (lineupIndex >= 0) {
    nextLineup[lineupIndex] = state.pendingBuyId;
  }

  if (benchIndex >= 0) {
    nextBench[benchIndex] = state.pendingBuyId;
  }

  return {
    lineupIds: nextLineup,
    benchIds: nextBench,
    pendingSellId: null,
    pendingBuyId: null,
  };
}

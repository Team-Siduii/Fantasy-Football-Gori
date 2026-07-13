import { NextResponse } from "next/server";
import {
  allRequiredBuyChoicesSubmitted,
  allRetryChoicesSubmitted,
  createTransferRoundState,
  getPendingManagers,
  getRemainingBuyCapacity,
  getSoldPlayerIds,
  getUnresolvedSoldPlayerIds,
  resolveSubmittedBuys,
  skipSellChoice,
  submitBuyChoice,
  submitSellChoices,
  syncTransferRoundParticipants,
  type TransferRoundParticipant,
  type TransferRoundState,
} from "@/domain/transfer-round";
import { validateTransferSquad } from "@/domain/transfer-validation";
import type { PlayerRecord } from "@/domain/player";
import { getTransferBudgetCapMillions } from "@/domain/team-budget";
import { getAuthenticatedEmail, isAuthenticatedSession } from "@/lib/auth-session";
import { getLeagueAdminConfigPersistent } from "@/lib/league-admin-config";
import { buildLeagueRankingSnapshot } from "@/lib/league-ranking";
import {
  isRoundLockedPersistent,
  readManagerStateForRoundPersistent,
  readManagerStatePersistent,
  saveManagerStateForRoundPersistent,
  type ManagerStateScope,
} from "@/lib/manager-state";
import { readTransferRoundPersistent, saveTransferRoundPersistent } from "@/lib/transfer-round-state";
import { readTeamRosterStatePersistent, removePlayerFromTeamRosterPersistent, addPlayerToTeamRosterPersistent } from "@/lib/team-roster-state";
import { parsePlayerCsv } from "@/domain/player-csv";
import { readFile } from "fs/promises";
import path from "path";
import { getInactivePlayer } from "@/lib/inactive-players";
import { isTeamEliminated } from "@/lib/knockout-phase";

function getScopeFromRequest(request: Request): ManagerStateScope {
  const mode = new URL(request.url).searchParams.get("mode");
  return mode === "wk" ? "wk" : "eredivisie";
}

function getRoundNumberFromRequest(request: Request) {
  const raw = new URL(request.url).searchParams.get("roundNumber");
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function loadPlayers(scope: ManagerStateScope): Promise<PlayerRecord[]> {
  if (scope === "wk") {
    const wkCsvPath = path.join(process.cwd(), "data", "players-wk.csv");
    try {
      const csvContent = await readFile(wkCsvPath, "utf-8");
      return parsePlayerCsv(csvContent).players;
    } catch {
      return [];
    }
  }
  const { bootstrapPlayersFromDefaultCsv } = await import("@/lib/player-bootstrap");
  const { listPlayers } = await import("@/lib/player-store");
  await bootstrapPlayersFromDefaultCsv();
  return listPlayers();
}

async function getTransferRoundContext(scope: ManagerStateScope, roundNumber: number, requesterEmail: string) {
  const rankingSnapshot = await buildLeagueRankingSnapshot(scope, requesterEmail);
  const activeRanking = rankingSnapshot.ranking;
  const participants: TransferRoundParticipant[] = activeRanking.map((entry) => ({
    managerId: entry.managerId,
    email: entry.email,
    displayName: entry.displayName,
    teamName: entry.teamName,
    subpoule: entry.subpoule,
    rankingPosition: entry.position,
  }));

  let state = (await readTransferRoundPersistent(roundNumber, scope)) ?? createTransferRoundState(roundNumber, participants);
  state = syncTransferRoundParticipants(state, participants);
  await saveTransferRoundPersistent(state, scope);

  return { rankingSnapshot, participants, state };
}

function buildBlockedPlayerIds(rosterByManager: Record<string, string[]>, state: TransferRoundState) {
  const blocked = new Set<string>();
  for (const ids of Object.values(rosterByManager)) {
    for (const id of ids) {
      blocked.add(id);
    }
  }
  for (const entry of state.entries) {
    for (const soldId of getSoldPlayerIds(entry)) {
      blocked.delete(soldId);
    }
  }
  return Array.from(blocked);
}

async function buildRosterByManager(scope: ManagerStateScope, state: TransferRoundState) {
  const rosterState = await readTeamRosterStatePersistent(scope);
  const result: Record<string, string[]> = {};
  for (const entry of state.entries) {
    result[entry.managerId] = rosterState.byTeamId[entry.managerId] ?? [];
  }
  return result;
}

async function applyResolvedTransfers(scope: ManagerStateScope, roundNumber: number, state: TransferRoundState) {
  for (const entry of state.entries) {
    if (entry.sellStatus === "PENDING") continue;

    const soldPlayerIds = getSoldPlayerIds(entry);
    if (soldPlayerIds.length === 0) continue;

    const managerState = await readManagerStateForRoundPersistent(roundNumber, scope, entry.email);
    let nextLineupIds = [...managerState.lineupIds];
    let nextBenchIds = [...managerState.benchIds];

    for (const transfer of entry.resolvedTransfers) {
      nextLineupIds = nextLineupIds.map((id) => (id === transfer.soldPlayerId ? transfer.boughtPlayerId : id));
      nextBenchIds = nextBenchIds.map((id) => (id === transfer.soldPlayerId ? transfer.boughtPlayerId : id));
    }

    const resolvedSoldIds = new Set(entry.resolvedTransfers.map((transfer) => transfer.soldPlayerId));
    const soldWithoutReplacement = soldPlayerIds.filter((playerId) => !resolvedSoldIds.has(playerId));
    if (soldWithoutReplacement.length > 0) {
      nextLineupIds = nextLineupIds.filter((id) => !soldWithoutReplacement.includes(id));
      nextBenchIds = nextBenchIds.filter((id) => !soldWithoutReplacement.includes(id));
    }

    for (const soldPlayerId of soldPlayerIds) {
      await removePlayerFromTeamRosterPersistent(entry.managerId, soldPlayerId, scope);
    }
    for (const transfer of entry.resolvedTransfers) {
      await addPlayerToTeamRosterPersistent(entry.managerId, transfer.boughtPlayerId, scope);
    }

    await saveManagerStateForRoundPersistent(
      roundNumber,
      {
        formation: managerState.formation,
        lineupIds: nextLineupIds,
        benchIds: nextBenchIds,
        pendingSellId: null,
        pendingBuyId: null,
        pickedTransferId: null,
      },
      scope,
      true,
      entry.email,
    );
  }
}

function maybeResolveState(state: TransferRoundState) {
  if (state.phase === "BUY" && allRequiredBuyChoicesSubmitted(state)) {
    return resolveSubmittedBuys(state);
  }
  if (state.phase === "AWAITING_RETRY" && allRetryChoicesSubmitted(state)) {
    return resolveSubmittedBuys(state);
  }
  return state;
}

function normalizeRequestedBuyIds(body: { playerId?: string; extraBuyPlayerId?: string; playerIds?: string[] }) {
  if (Array.isArray(body.playerIds)) {
    return body.playerIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  }
  return [body.playerId, body.extraBuyPlayerId].filter((id): id is string => typeof id === "string" && id.length > 0);
}

function normalizeRequestedSellIds(body: { playerId?: string; playerIds?: string[] }) {
  if (Array.isArray(body.playerIds)) {
    return body.playerIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  }
  return [body.playerId].filter((id): id is string => typeof id === "string" && id.length > 0);
}

export async function GET(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const requesterEmail = await getAuthenticatedEmail();
  if (!requesterEmail) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const scope = getScopeFromRequest(request);
  const roundNumber = getRoundNumberFromRequest(request);
  if (!roundNumber) {
    return NextResponse.json({ error: "roundNumber is verplicht" }, { status: 400 });
  }

  const { state } = await getTransferRoundContext(scope, roundNumber, requesterEmail);
  const rosterByManager = await buildRosterByManager(scope, state);
  const currentEntry = state.entries.find((entry) => entry.email.toLowerCase() === requesterEmail.toLowerCase()) ?? null;

  return NextResponse.json({
    state,
    currentEntry,
    pendingManagers: getPendingManagers(state),
    blockedPlayerIds: buildBlockedPlayerIds(rosterByManager, state),
  });
}

export async function POST(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const requesterEmail = await getAuthenticatedEmail();
  if (!requesterEmail) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  let body: { action?: string; roundNumber?: number; playerId?: string; extraBuyPlayerId?: string; playerIds?: string[] } = {};
  try {
    body = (await request.json()) as { action?: string; roundNumber?: number; playerId?: string; extraBuyPlayerId?: string; playerIds?: string[] };
  } catch {
    body = {};
  }

  const scope = getScopeFromRequest(request);
  const roundNumber = Number.isInteger(body.roundNumber) && (body.roundNumber as number) > 0 ? (body.roundNumber as number) : getRoundNumberFromRequest(request);
  if (!roundNumber) {
    return NextResponse.json({ error: "roundNumber is verplicht" }, { status: 400 });
  }

  const { rankingSnapshot, state: hydratedState } = await getTransferRoundContext(scope, roundNumber, requesterEmail);
  if (roundNumber < Math.max(1, rankingSnapshot.currentRound)) {
    return NextResponse.json({ error: "Transfers voor vorige rondes zijn gesloten" }, { status: 400 });
  }
  if (await isRoundLockedPersistent(roundNumber, scope)) {
    return NextResponse.json({ error: "Deze speelronde is vergrendeld voor transfers" }, { status: 423 });
  }
  const requesterEntry = hydratedState.entries.find((entry) => entry.email.toLowerCase() === requesterEmail.toLowerCase());
  if (!requesterEntry) {
    return NextResponse.json({ error: "Manager zit niet in deze transfergroep" }, { status: 403 });
  }

  let nextState = hydratedState;

  function getInactiveIds(ids: string[]): string[] {
    return ids.filter((id) => Boolean(getInactivePlayer(id)));
  }

  for (const entry of nextState.entries) {
    const managerState = await readManagerStatePersistent(scope, entry.email);
    const teamIds = [...managerState.lineupIds, ...managerState.benchIds];
    const inactiveIds = getInactiveIds(teamIds);
    if (inactiveIds.length === 0) continue;
    const newAutoSells = inactiveIds.filter((id) => id !== entry.sellPlayerId && !entry.autoSellPlayerIds.includes(id));
    if (newAutoSells.length === 0) continue;
    nextState = {
      ...nextState,
      entries: nextState.entries.map((e) =>
        e.managerId === entry.managerId
          ? { ...e, autoSellPlayerIds: [...e.autoSellPlayerIds, ...newAutoSells], updatedAt: new Date().toISOString() }
          : e,
      ),
    };
  }
  await saveTransferRoundPersistent(nextState, scope);

  const currentRequesterEntry = nextState.entries.find((entry) => entry.email.toLowerCase() === requesterEmail.toLowerCase());
  if (!currentRequesterEntry) {
    return NextResponse.json({ error: "Manager zit niet in deze transfergroep" }, { status: 403 });
  }

  const action = body.action ?? "";
  try {
    if (action === "submit-sell") {
      const requestedSellIds = Array.from(new Set(normalizeRequestedSellIds(body)));
      if (requestedSellIds.length === 0) {
        return NextResponse.json({ error: "playerId is verplicht" }, { status: 400 });
      }

      const managerState = await readManagerStatePersistent(scope, requesterEmail);
      const ownPlayerIds = new Set([...managerState.lineupIds, ...managerState.benchIds]);
      if (requestedSellIds.some((playerId) => !ownPlayerIds.has(playerId))) {
        return NextResponse.json({ error: "Je kunt alleen spelers uit je eigen team verkopen" }, { status: 400 });
      }

      const allPlayers = await loadPlayers(scope);
      const playerById = new Map(allPlayers.map((player) => [player.id, player]));
      const inactiveOrEliminatedIds: string[] = [];
      const regularSellIds: string[] = [];

      for (const playerId of requestedSellIds) {
        const player = playerById.get(playerId) ?? getInactivePlayer(playerId);
        const forcedSell = Boolean(getInactivePlayer(playerId)) || Boolean(player && isTeamEliminated(player.club));
        if (forcedSell) {
          inactiveOrEliminatedIds.push(playerId);
        } else {
          regularSellIds.push(playerId);
        }
      }

      if (regularSellIds.length > 1) {
        return NextResponse.json({ error: "Je kunt maximaal 1 reguliere handmatige verkoop kiezen. Uitgeschakelde spelers mag je extra meenemen." }, { status: 400 });
      }

      if (regularSellIds.length === 0 && inactiveOrEliminatedIds.length === 0) {
        return NextResponse.json({ error: "Kies minstens één speler om te verkopen" }, { status: 400 });
      }

      nextState = submitSellChoices(nextState, currentRequesterEntry.managerId, {
        sellPlayerId: regularSellIds[0] ?? null,
        autoSellPlayerIds: inactiveOrEliminatedIds,
      });
    } else if (action === "skip-sell") {
      nextState = skipSellChoice(nextState, currentRequesterEntry.managerId);
    } else if (action === "submit-buy") {
      const normalizedBuyIds = normalizeRequestedBuyIds(body);
      const uniqueBuyIds = Array.from(new Set(normalizedBuyIds));
      if (uniqueBuyIds.length !== normalizedBuyIds.length) {
        return NextResponse.json({ error: "Je kunt niet twee keer dezelfde speler kiezen" }, { status: 400 });
      }

      const remainingCapacity = getRemainingBuyCapacity(currentRequesterEntry);
      if (uniqueBuyIds.length > remainingCapacity) {
        return NextResponse.json({ error: `Je kunt maximaal ${remainingCapacity} speler${remainingCapacity === 1 ? "" : "s"} kopen` }, { status: 400 });
      }

      const allPlayers = await loadPlayers(scope);
      const playerById = new Map(allPlayers.map((player) => [player.id, player]));

      const rosterByManager = await buildRosterByManager(scope, nextState);
      const blockedPlayerIds = new Set(buildBlockedPlayerIds(rosterByManager, nextState));

      for (const playerId of uniqueBuyIds) {
        const incomingPlayer = playerById.get(playerId);
        if (!incomingPlayer) {
          return NextResponse.json({ error: "Speler niet gevonden" }, { status: 404 });
        }
        if (incomingPlayer.inactive) {
          return NextResponse.json({ error: "Deze speler is niet meer actief in de volgende ronde en kan niet gekocht worden." }, { status: 400 });
        }
        if (blockedPlayerIds.has(playerId)) {
          return NextResponse.json({ error: "Een van deze spelers is niet beschikbaar in de transferpool" }, { status: 400 });
        }
      }

      const managerState = await readManagerStatePersistent(scope, requesterEmail);
      let rosterPlayers = [...managerState.lineupIds, ...managerState.benchIds]
        .map((playerId) => playerById.get(playerId))
        .filter((player): player is PlayerRecord => Boolean(player));
      const budgetCap = (await getLeagueAdminConfigPersistent(scope)).budget.teamValueCapMillions ?? getTransferBudgetCapMillions(scope);
      const unresolvedSoldIds = getUnresolvedSoldPlayerIds(currentRequesterEntry);

      for (const [index, playerId] of uniqueBuyIds.entries()) {
        const incomingPlayer = playerById.get(playerId)!;
        try {
          rosterPlayers = validateTransferSquad({
            rosterPlayers,
            incomingPlayer,
            soldPlayerId: unresolvedSoldIds[index] ?? "",
            budgetCap,
            scope,
            roundNumber,
          });
        } catch (error) {
          return NextResponse.json({ error: error instanceof Error ? error.message : "Ongeldige transfer" }, { status: 400 });
        }
      }

      nextState = submitBuyChoice(nextState, currentRequesterEntry.managerId, uniqueBuyIds);
      nextState = maybeResolveState(nextState);
      await applyResolvedTransfers(scope, roundNumber, nextState);
    } else {
      return NextResponse.json({ error: "Onbekende actie" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transferactie mislukt" }, { status: 400 });
  }

  nextState = maybeResolveState(nextState);
  await applyResolvedTransfers(scope, roundNumber, nextState);
  await saveTransferRoundPersistent(nextState, scope);

  const rosterByManager = await buildRosterByManager(scope, nextState);
  const currentEntry = nextState.entries.find((entry) => entry.email.toLowerCase() === requesterEmail.toLowerCase()) ?? null;

  return NextResponse.json({
    ok: true,
    state: nextState,
    currentEntry,
    pendingManagers: getPendingManagers(nextState),
    blockedPlayerIds: buildBlockedPlayerIds(rosterByManager, nextState),
    ranking: rankingSnapshot.ranking,
  });
}

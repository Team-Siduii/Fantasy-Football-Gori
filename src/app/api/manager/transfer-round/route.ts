import { NextResponse } from "next/server";
import {
  allRequiredBuyChoicesSubmitted,
  allRetryChoicesSubmitted,
  createTransferRoundState,
  finalizeExpiredTransferRound,
  getPendingManagers,
  getRemainingBuyCapacity,
  getSoldPlayerIds,
  getUnresolvedSoldPlayerIds,
  resolveSubmittedBuys,
  skipSellChoice,
  submitBuyChoice,
  submitSellChoice,
  submitSellChoices,
  syncTransferRoundParticipants,
  type TransferRoundParticipant,
  type TransferRoundState,
} from "@/domain/transfer-round";
import { validateTransferSquad } from "@/domain/transfer-validation";
import type { PlayerRecord } from "@/domain/player";
import { getTransferBudgetCapMillions } from "@/domain/team-budget";
import { getAuthenticatedEmail, isAuthenticatedSession } from "@/lib/auth-session";
import { ensureAuthStateFromDb } from "@/lib/auth-store";
import { readRosterPlayerIdsForManagerPersistent } from "@/lib/draft-manager-sync";

import { getLeagueAdminConfigPersistent } from "@/lib/league-admin-config";
import { buildLeagueRankingSnapshot } from "@/lib/league-ranking";
import {
  isRoundLockedPersistent,
  readManagerStateForRoundPersistent,
  readManagerStatePersistent,
  saveManagerStateForRoundPersistent,
  type ManagerStateScope,
} from "@/lib/manager-state";
import { addPlayerToTeamRosterPersistent, removePlayerFromTeamRosterPersistent } from "@/lib/team-roster-state";
import { readTransferRoundPersistent, saveTransferRoundPersistent } from "@/lib/transfer-round-state";
import { parsePlayerCsv } from "@/domain/player-csv";
import { readFile } from "fs/promises";
import path from "path";
import { getWkMatches } from "@/lib/wk-sync-store";
import { applyWkPlayerAvailabilityAndPoints } from "../../../../lib/wk-availability";
import { applyWkTransferPriceOffsetMillions } from "../../../../lib/wk-price";

function getScopeFromRequest(request: Request): ManagerStateScope {
  const mode = new URL(request.url).searchParams.get("mode");
  return mode === "wk" ? "wk" : "eredivisie";
}

function getRoundNumberFromRequest(request: Request) {
  const raw = new URL(request.url).searchParams.get("roundNumber");
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function loadPlayers(scope: ManagerStateScope, roundNumber?: number | null): Promise<PlayerRecord[]> {
  if (scope === "wk") {
    const wkCsvPath = path.join(process.cwd(), "data", "players-wk.csv");
    try {
      const csvContent = await readFile(wkCsvPath, "utf-8");
      const csvPlayers = parsePlayerCsv(csvContent).players.map((player) => ({
        ...player,
        prijs: applyWkTransferPriceOffsetMillions(player.prijs),
      }));
      const matches = await getWkMatches();
      return applyWkPlayerAvailabilityAndPoints({
        csvPlayers,
        matches,
        roundNumber,
      });
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
  if (roundNumber < Math.max(1, rankingSnapshot.currentRound)) {
    state = finalizeExpiredTransferRound(state);
  }
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
  const result: Record<string, string[]> = {};
  for (const entry of state.entries) {
    const managerState = await readManagerStatePersistent(scope, entry.email);
    const managerStateIds = [...managerState.lineupIds, ...managerState.benchIds].filter(
      (playerId) => typeof playerId === "string" && playerId.trim().length > 0,
    );

    if (managerStateIds.length > 0) {
      result[entry.managerId] = managerStateIds;
      continue;
    }

    result[entry.managerId] = await readRosterPlayerIdsForManagerPersistent({
      managerEmail: entry.email,
      scope,
    });
  }
  return result;
}

async function applyResolvedTransfers(scope: ManagerStateScope, roundNumber: number, state: TransferRoundState) {
  const appliedManagerIds = new Set<string>();

  for (const entry of state.entries) {
    if (appliedManagerIds.has(entry.managerId) || (entry.resolvedTransfers?.length ?? 0) === 0) {
      continue;
    }

    const managerState = await readManagerStateForRoundPersistent(roundNumber, scope, entry.email);
    let nextLineupIds = [...managerState.lineupIds];
    let nextBenchIds = [...managerState.benchIds];

    for (const transfer of entry.resolvedTransfers) {
      nextLineupIds = nextLineupIds.map((playerId) => (playerId === transfer.soldPlayerId ? transfer.boughtPlayerId : playerId));
      nextBenchIds = nextBenchIds.map((playerId) => (playerId === transfer.soldPlayerId ? transfer.boughtPlayerId : playerId));
      await removePlayerFromTeamRosterPersistent(entry.managerId, transfer.soldPlayerId, scope);
      await addPlayerToTeamRosterPersistent(entry.managerId, transfer.boughtPlayerId, scope);
    }

    const soldWithoutReplacement = getUnresolvedSoldPlayerIds(entry);
    if (soldWithoutReplacement.length > 0) {
      nextLineupIds = nextLineupIds.filter((playerId) => !soldWithoutReplacement.includes(playerId));
      nextBenchIds = nextBenchIds.filter((playerId) => !soldWithoutReplacement.includes(playerId));
      for (const soldPlayerId of soldWithoutReplacement) {
        await removePlayerFromTeamRosterPersistent(entry.managerId, soldPlayerId, scope);
      }
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

    appliedManagerIds.add(entry.managerId);
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

function normalizePlayerIds(body: { playerId?: string; playerIds?: string[] }) {
  const ids = Array.isArray(body.playerIds) ? body.playerIds : body.playerId ? [body.playerId] : [];
  return Array.from(new Set(ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}

export async function GET(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  await ensureAuthStateFromDb();

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
  if (state.entries.some((entry) => (entry.resolvedTransfers?.length ?? 0) > 0)) {
    await applyResolvedTransfers(scope, roundNumber, state);
  }
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

  await ensureAuthStateFromDb();

  const requesterEmail = await getAuthenticatedEmail();
  if (!requesterEmail) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  let body: { action?: string; roundNumber?: number; playerId?: string; playerIds?: string[] } = {};
  try {
    body = (await request.json()) as { action?: string; roundNumber?: number; playerId?: string; playerIds?: string[] };
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

  const requestedPlayerIds = normalizePlayerIds(body);
  let nextState = hydratedState;
  const action = body.action ?? "";

  if (action === "submit-sell") {
    if (requestedPlayerIds.length === 0) {
      return NextResponse.json({ error: "playerId of playerIds is verplicht" }, { status: 400 });
    }

    const managerState = await readManagerStatePersistent(scope, requesterEmail);
    const ownPlayerIds = new Set([...managerState.lineupIds, ...managerState.benchIds]);
    const invalidPlayerId = requestedPlayerIds.find((playerId) => !ownPlayerIds.has(playerId));
    if (invalidPlayerId) {
      return NextResponse.json({ error: "Je kunt alleen spelers uit je eigen team verkopen" }, { status: 400 });
    }

    const knownPlayers = new Map((await loadPlayers(scope, roundNumber)).map((player) => [player.id, player]));
    const forcedSellIds = requestedPlayerIds.filter((playerId) => {
      const player = knownPlayers.get(playerId) as (PlayerRecord & { inactive?: boolean; isActive?: boolean }) | undefined;
      return player?.inactive === true || player?.isActive === false;
    });
    const regularSellIds = requestedPlayerIds.filter((playerId) => !forcedSellIds.includes(playerId));

    if (regularSellIds.length > 1) {
      return NextResponse.json({ error: "Je kunt maximaal één reguliere verkoop kiezen" }, { status: 400 });
    }

    if (regularSellIds.length === 0 && forcedSellIds.length === 0) {
      return NextResponse.json({ error: "Geen geldige verkoopkeuze ontvangen" }, { status: 400 });
    }

    if (regularSellIds.length === 1 || forcedSellIds.length > 0) {
      nextState = submitSellChoices(
        nextState,
        requesterEntry.managerId,
        {
          sellPlayerId: regularSellIds[0] ?? null,
          autoSellPlayerIds: forcedSellIds,
        },
      );
    } else {
      nextState = submitSellChoice(nextState, requesterEntry.managerId, regularSellIds[0]);
    }
  } else if (action === "skip-sell") {
    nextState = skipSellChoice(nextState, requesterEntry.managerId);
  } else if (action === "submit-buy") {
    if (requestedPlayerIds.length === 0) {
      return NextResponse.json({ error: "playerId of playerIds is verplicht" }, { status: 400 });
    }

    const freshEntry = nextState.entries.find((entry) => entry.managerId === requesterEntry.managerId);
    if (!freshEntry) {
      return NextResponse.json({ error: "Manager zit niet in deze transfergroep" }, { status: 403 });
    }

    const remainingCapacity = getRemainingBuyCapacity(freshEntry);
    if (requestedPlayerIds.length > remainingCapacity) {
      return NextResponse.json(
        { error: `Je kunt maximaal ${remainingCapacity} speler${remainingCapacity === 1 ? "" : "s"} kopen in deze stap` },
        { status: 400 },
      );
    }

    const allPlayers = await loadPlayers(scope, roundNumber);
    const playerById = new Map(allPlayers.map((player) => [player.id, player]));
    for (const playerId of requestedPlayerIds) {
      if (!playerById.has(playerId)) {
        return NextResponse.json({ error: "Speler niet gevonden" }, { status: 404 });
      }
    }

    const rosterByManager = await buildRosterByManager(scope, nextState);
    const blockedPlayerIds = new Set(buildBlockedPlayerIds(rosterByManager, nextState));
    const unavailablePlayerId = requestedPlayerIds.find((playerId) => blockedPlayerIds.has(playerId));
    if (unavailablePlayerId) {
      return NextResponse.json({ error: "Een of meer spelers zijn niet beschikbaar in de transferpool" }, { status: 400 });
    }

    const managerState = await readManagerStatePersistent(scope, requesterEmail);
    const unresolvedSoldIds = getUnresolvedSoldPlayerIds(freshEntry);
    const budgetCap = (await getLeagueAdminConfigPersistent(scope)).budget.teamValueCapMillions ?? getTransferBudgetCapMillions(scope);
    let rosterPlayers = [...managerState.lineupIds, ...managerState.benchIds]
      .map((playerId) => playerById.get(playerId))
      .filter((player): player is PlayerRecord => Boolean(player));

    for (const [index, playerId] of requestedPlayerIds.entries()) {
      const incomingPlayer = playerById.get(playerId)!;
      const soldPlayerId = unresolvedSoldIds[index] ?? freshEntry.sellPlayerId ?? "";

      try {
        validateTransferSquad({
          scope,
          rosterPlayers,
          incomingPlayer,
          soldPlayerId,
          budgetCap,
        });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Ongeldige transfer" }, { status: 400 });
      }

      rosterPlayers = rosterPlayers
        .filter((player) => player.id !== soldPlayerId)
        .concat(incomingPlayer);
    }

    nextState = submitBuyChoice(nextState, requesterEntry.managerId, requestedPlayerIds);
  } else {
    return NextResponse.json({ error: "Onbekende actie" }, { status: 400 });
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

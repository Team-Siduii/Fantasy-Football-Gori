import { NextResponse } from "next/server";
import {
  allRequiredBuyChoicesSubmitted,
  allRetryChoicesSubmitted,
  applyAutoSells,
  createTransferRoundState,
  getBuyCount,
  getPendingManagers,
  resolveSubmittedBuys,
  skipSellChoice,
  submitBuyChoice,
  submitSellChoice,
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
import { isRoundLockedPersistent, readManagerStateForRoundPersistent, readManagerStatePersistent, saveManagerStateForRoundPersistent, type ManagerStateScope } from "@/lib/manager-state";
import { readTransferRoundPersistent, saveTransferRoundPersistent } from "@/lib/transfer-round-state";
import { readTeamRosterStatePersistent, removePlayerFromTeamRosterPersistent, addPlayerToTeamRosterPersistent } from "@/lib/team-roster-state";
import { parsePlayerCsv } from "@/domain/player-csv";
import { readFile } from "fs/promises";
import path from "path";
import { getInactivePlayer } from "@/lib/inactive-players";

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
    if (entry.sellPlayerId) {
      blocked.delete(entry.sellPlayerId);
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
  const appliedManagerIds = new Set<string>();

  for (const entry of state.entries) {
    if (appliedManagerIds.has(entry.managerId)) continue;

    const resolved = entry.resolvedTransfer;
    const extraResolved = entry.extraResolvedTransfer;

    if (!resolved && !extraResolved) continue;

    const managerState = await readManagerStateForRoundPersistent(roundNumber, scope, entry.email);
    let nextLineupIds = [...managerState.lineupIds];
    let nextBenchIds = [...managerState.benchIds];

    if (resolved) {
      nextLineupIds = nextLineupIds.map((id) => (id === resolved.soldPlayerId ? resolved.boughtPlayerId : id));
      nextBenchIds = nextBenchIds.map((id) => (id === resolved.soldPlayerId ? resolved.boughtPlayerId : id));
      await removePlayerFromTeamRosterPersistent(entry.managerId, resolved.soldPlayerId, scope);
      await addPlayerToTeamRosterPersistent(entry.managerId, resolved.boughtPlayerId, scope);
    }

    if (extraResolved) {
      nextLineupIds = nextLineupIds.map((id) => (id === extraResolved.soldPlayerId ? extraResolved.boughtPlayerId : id));
      nextBenchIds = nextBenchIds.map((id) => (id === extraResolved.soldPlayerId ? extraResolved.boughtPlayerId : id));
      await removePlayerFromTeamRosterPersistent(entry.managerId, extraResolved.soldPlayerId, scope);
      await addPlayerToTeamRosterPersistent(entry.managerId, extraResolved.boughtPlayerId, scope);
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

  let body: { action?: string; roundNumber?: number; playerId?: string; extraBuyPlayerId?: string } = {};
  try {
    body = (await request.json()) as { action?: string; roundNumber?: number; playerId?: string; extraBuyPlayerId?: string };
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

  // Apply auto-sells voor inactive spelers (WK verlaten)
  const rosterState = await readTeamRosterStatePersistent(scope);
  function getTeamPlayerIds(managerId: string): string[] {
    return rosterState.byTeamId[managerId] ?? [];
  }
  function getInactiveIds(ids: string[]): string[] {
    return ids.filter((id) => Boolean(getInactivePlayer(id)));
  }
  nextState = applyAutoSells(nextState, getInactiveIds, getTeamPlayerIds);
  await saveTransferRoundPersistent(nextState, scope);

  const action = body.action ?? "";
  try {
  if (action === "submit-sell") {
    if (!body.playerId) {
      return NextResponse.json({ error: "playerId is verplicht" }, { status: 400 });
    }
    const managerState = await readManagerStatePersistent(scope, requesterEmail);
    const ownPlayerIds = new Set([...managerState.lineupIds, ...managerState.benchIds]);
    if (!ownPlayerIds.has(body.playerId)) {
      return NextResponse.json({ error: "Je kunt alleen een speler uit je eigen team verkopen" }, { status: 400 });
    }
    nextState = submitSellChoice(nextState, requesterEntry.managerId, body.playerId);
  } else if (action === "skip-sell") {
    nextState = skipSellChoice(nextState, requesterEntry.managerId);
  } else if (action === "submit-buy") {
    if (!body.playerId) {
      return NextResponse.json({ error: "playerId is verplicht" }, { status: 400 });
    }
    const extraBuyPlayerId: string | undefined = typeof body.extraBuyPlayerId === "string" && body.extraBuyPlayerId ? body.extraBuyPlayerId : undefined;

    const allPlayers = await loadPlayers(scope);
    const playerById = new Map(allPlayers.map((player) => [player.id, player]));
    const incomingPlayer = playerById.get(body.playerId);
    if (!incomingPlayer) {
      return NextResponse.json({ error: "Speler niet gevonden" }, { status: 404 });
    }

    // Validate extra buy if provided
    if (extraBuyPlayerId) {
      const extraPlayer = playerById.get(extraBuyPlayerId);
      if (!extraPlayer) {
        return NextResponse.json({ error: "Tweede speler niet gevonden" }, { status: 404 });
      }
      if (extraBuyPlayerId === body.playerId) {
        return NextResponse.json({ error: "Je kunt niet twee keer dezelfde speler kopen" }, { status: 400 });
      }
    }

    const rosterByManager = await buildRosterByManager(scope, nextState);
    const blockedPlayerIds = new Set(buildBlockedPlayerIds(rosterByManager, nextState));
    if (blockedPlayerIds.has(body.playerId) || (extraBuyPlayerId && blockedPlayerIds.has(extraBuyPlayerId))) {
      return NextResponse.json({ error: "Een van deze spelers is niet beschikbaar in de transferpool" }, { status: 400 });
    }

    const managerState = await readManagerStatePersistent(scope, requesterEmail);
    const rosterPlayers = [...managerState.lineupIds, ...managerState.benchIds]
      .map((playerId) => playerById.get(playerId))
      .filter((player): player is PlayerRecord => Boolean(player));
    const budgetCap = (await getLeagueAdminConfigPersistent(scope)).budget.teamValueCapMillions ?? getTransferBudgetCapMillions(scope);

    // Validate primary buy
    const primarySoldId = requesterEntry.sellPlayerId ?? requesterEntry.autoSellPlayerIds[0] ?? "";
    try {
      validateTransferSquad({
        rosterPlayers,
        incomingPlayer,
        soldPlayerId: primarySoldId,
        budgetCap,
      });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Ongeldige transfer" }, { status: 400 });
    }

    // Validate extra buy if provided
    if (extraBuyPlayerId) {
      const extraPlayer = playerById.get(extraBuyPlayerId)!;
      try {
        validateTransferSquad({
          rosterPlayers,
          incomingPlayer: extraPlayer,
          soldPlayerId: requesterEntry.autoSellPlayerIds[1] ?? requesterEntry.autoSellPlayerIds[0] ?? "",
          budgetCap,
        });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? `Tweede speler: ${error.message}` : "Ongeldige tweede transfer" }, { status: 400 });
      }
    }

    nextState = submitBuyChoice(nextState, requesterEntry.managerId, body.playerId, extraBuyPlayerId);
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

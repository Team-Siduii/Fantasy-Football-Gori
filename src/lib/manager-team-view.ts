import { readFile } from "fs/promises";
import path from "path";

import type { PlayerRecord } from "../domain/player";
import { parsePlayerCsv } from "../domain/player-csv";
import { getTransferBudgetCapMillions } from "../domain/team-budget";

import { hydrateSavedTeamState } from "./manager-team-hydration";
import { type ManagerStateScope } from "./manager-state";
import { readTeamViewSnapshotPersistent } from "./manager-team-state-source";
import { loadPlayerPoints } from "./player-points-store";
import { getManagerRoundScorePersistent, summarizeManagerTeamScoresThroughRoundPersistent } from "./team-score-state";
import {
  buildWkPlayerRoundAdvancementPointsMap,
  buildWkPlayerRoundPointsMap,
  buildWkPlayerTotalPointsMapThroughRound,
  listCalculatedWkPlayerPoints,
} from "./wk-player-scoring";
import { getWkMatches } from "./wk-sync-store";
import { applyWkPlayerAvailabilityAndPoints } from "./wk-availability";
import { applyWkTransferPriceOffsetMillions } from "./wk-price";
import { getLatestCompletedWorldCupRound } from "./world-cup-schedule";

export type TeamViewPlayer = PlayerRecord & {
  punten: number;
  roundPoints: number;
  totalPoints: number;
  advancementPoints: number;
};

export type ManagerTeamViewModel = {
  roundNumber: number | null;
  formation: string;
  lineup: TeamViewPlayer[];
  bench: TeamViewPlayer[];
  budgetCap: number;
  budgetRemaining: number;
  squadCost: number;
  pendingSellId: string | null;
  pendingBuyId: string | null;
  teamTotalPoints: number;
  teamCurrentRoundPoints: number;
  scoreSource: string;
  hasPersistedPlayers: boolean;
};

function toTeamViewPlayer(player: PlayerRecord & {
  punten?: number;
  roundPoints?: number;
  totalPoints?: number;
  advancementPoints?: number;
}): TeamViewPlayer {
  const punten = Number(player.punten ?? 0);
  return {
    ...player,
    punten,
    roundPoints: Number(player.roundPoints ?? punten),
    totalPoints: Number(player.totalPoints ?? punten),
    advancementPoints: Number(player.advancementPoints ?? 0),
  };
}

function normalizeRoundNumber(roundNumber?: number | null): number | null {
  return Number.isInteger(roundNumber) && (roundNumber ?? 0) > 0 ? (roundNumber as number) : null;
}

function getEffectiveWkRound(roundNumber: number | null): number {
  const latestCompletedRound = getLatestCompletedWorldCupRound();

  if (roundNumber !== null) {
    return roundNumber;
  }

  return latestCompletedRound > 0 ? latestCompletedRound : 1;
}

async function loadPlayersForScope(scope: ManagerStateScope, roundNumber: number | null): Promise<PlayerRecord[]> {
  if (scope === "wk") {
    const wkCsvPath = path.join(process.cwd(), "data", "players-wk.csv");
    const csvContent = await readFile(wkCsvPath, "utf-8");
    const csvPlayers = parsePlayerCsv(csvContent).players.map((player) => ({
      ...player,
      prijs: applyWkTransferPriceOffsetMillions(player.prijs),
    }));
    const [calculatedPlayers, matches] = await Promise.all([
      listCalculatedWkPlayerPoints(roundNumber ?? undefined),
      getWkMatches(),
    ]);

    return applyWkPlayerAvailabilityAndPoints({
      csvPlayers,
      calculatedPlayers,
      matches,
      roundNumber,
    });
  }

  const { bootstrapPlayersFromDefaultCsv } = await import("./player-bootstrap");
  const { listPlayers } = await import("./player-store");
  await bootstrapPlayersFromDefaultCsv();
  return listPlayers();
}

async function buildPointsMaps(scope: ManagerStateScope, roundNumber: number | null) {
  const roundPoints = new Map<string, number>();
  const totalPoints = new Map<string, number>();
  const advancementPoints = new Map<string, number>();

  if (scope === "wk") {
    const [roundMap, totalMap, advancementMap] = await Promise.all([
      buildWkPlayerRoundPointsMap(roundNumber ?? undefined),
      buildWkPlayerTotalPointsMapThroughRound(roundNumber ?? undefined),
      buildWkPlayerRoundAdvancementPointsMap(roundNumber ?? undefined),
    ]);

    for (const [fantasyplayerId, points] of Array.from(roundMap.entries())) {
      roundPoints.set(String(fantasyplayerId), points);
    }

    for (const [fantasyplayerId, points] of Array.from(totalMap.entries())) {
      totalPoints.set(String(fantasyplayerId), points);
    }

    for (const [fantasyplayerId, points] of Array.from(advancementMap.entries())) {
      advancementPoints.set(String(fantasyplayerId), points);
    }

    return { roundPoints, totalPoints, advancementPoints, scoreSource: "team-score-state" } as const;
  }

  const pointsSnapshot = await loadPlayerPoints(scope);
  if (pointsSnapshot) {
    for (const player of pointsSnapshot.players) {
      if (!player.fantasyplayerId) {
        continue;
      }
      roundPoints.set(String(player.fantasyplayerId), player.totalPoints);
      totalPoints.set(String(player.fantasyplayerId), player.totalPoints);
    }
  }

  return { roundPoints, totalPoints, advancementPoints, scoreSource: "player-points" } as const;
}

export async function buildManagerTeamViewPersistent(input: {
  scope: ManagerStateScope;
  managerEmail: string;
  roundNumber?: number | null;
}): Promise<ManagerTeamViewModel> {
  const normalizedRound = normalizeRoundNumber(input.roundNumber);
  const effectiveWkRound = input.scope === "wk" ? getEffectiveWkRound(normalizedRound) : null;
  const effectiveRound = input.scope === "wk" ? effectiveWkRound : normalizedRound;
  const [allPlayers, state, pointMaps] = await Promise.all([
    loadPlayersForScope(input.scope, effectiveRound),
    readTeamViewSnapshotPersistent({
      scope: input.scope,
      managerEmail: input.managerEmail,
      roundNumber: effectiveRound,
    }),
    buildPointsMaps(input.scope, effectiveRound),
  ]);

  const enrichedPlayers: TeamViewPlayer[] = allPlayers.map((player) => {
    const roundPoints = pointMaps.roundPoints.get(String(player.id)) ?? 0;
    const totalPoints = pointMaps.totalPoints.get(String(player.id)) ?? roundPoints;
    const advancementPoints = pointMaps.advancementPoints.get(String(player.id)) ?? 0;
    return {
      ...player,
      punten: roundPoints,
      roundPoints,
      totalPoints,
      advancementPoints,
    };
  });

  const hydratedState = hydrateSavedTeamState({
    players: enrichedPlayers,
    formation: state.formation,
    lineupIds: state.lineupIds,
    benchIds: state.benchIds,
  });
  const hydratedLineup = hydratedState.lineup.map(toTeamViewPlayer);
  const hydratedBench = hydratedState.bench.map(toTeamViewPlayer);

  const budgetCap = getTransferBudgetCapMillions(input.scope);
  const squadPlayers = [...hydratedLineup, ...hydratedBench].filter((player) => !player.id.startsWith("open-"));
  const squadCost = squadPlayers.reduce((sum, player) => sum + (player.prijs ?? 0), 0);
  const budgetRemaining = Math.max(0, budgetCap - squadCost);
  const hasPersistedPlayers = state.lineupIds.length > 0 || state.benchIds.length > 0;

  if (input.scope === "wk") {
    const selectedWkRound = effectiveWkRound ?? 1;
    const [scoreSummary, selectedRoundScore] = await Promise.all([
      summarizeManagerTeamScoresThroughRoundPersistent(input.scope, input.managerEmail, selectedWkRound),
      getManagerRoundScorePersistent(input.scope, input.managerEmail, selectedWkRound),
    ]);

    return {
      roundNumber: selectedWkRound,
      formation: state.formation,
      lineup: hydratedLineup,
      bench: hydratedBench,
      budgetCap,
      budgetRemaining,
      squadCost,
      pendingSellId: state.pendingSellId,
      pendingBuyId: state.pendingBuyId ?? state.pickedTransferId,
      teamTotalPoints: scoreSummary.totalPoints,
      teamCurrentRoundPoints: selectedRoundScore?.totalPoints ?? scoreSummary.currentRoundPoints,
      scoreSource: pointMaps.scoreSource,
      hasPersistedPlayers,
    };
  }

  const visibleRoundPoints = hydratedLineup.reduce((sum, player) => sum + player.punten, 0)
    + hydratedBench.reduce((sum, player) => sum + Math.ceil(player.punten / 2), 0);

  return {
    roundNumber: normalizedRound,
    formation: state.formation,
    lineup: hydratedLineup,
    bench: hydratedBench,
    budgetCap,
    budgetRemaining,
    squadCost,
    pendingSellId: state.pendingSellId,
    pendingBuyId: state.pendingBuyId ?? state.pickedTransferId,
    teamTotalPoints: visibleRoundPoints,
    teamCurrentRoundPoints: visibleRoundPoints,
    scoreSource: pointMaps.scoreSource,
    hasPersistedPlayers,
  };
}

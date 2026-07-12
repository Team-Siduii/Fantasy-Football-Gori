import { computeTeamSquadPoints } from "./player-derived";
import { getLeagueAdminConfigPersistent, type LeagueMode } from "./league-admin-config";
import { getLatestSyncRound } from "./wk-sync-store";
import { readManagerStateForRoundPersistent } from "./manager-state";
import {
  saveManagerRoundScoreSnapshotPersistent,
  summarizeManagerTeamScoresPersistent,
  type TeamScoreRoundSnapshot,
  type TeamScoreScope,
} from "./team-score-state";
import { buildWkPlayerPointsByCsvId } from "./wk-player-scoring";
import { parsePlayerCsv } from "@/domain/player-csv";
import { readFile } from "fs/promises";
import path from "path";

export type ComputedTeamRoundScore = {
  lineupPoints: number;
  benchPoints: number;
  totalPoints: number;
};

export function computeTeamRoundScore(input: {
  lineupIds: string[];
  benchIds: string[];
  pointsById: Map<string, number>;
}): ComputedTeamRoundScore {
  const lineupPoints = input.lineupIds.reduce((sum, id) => sum + (input.pointsById.get(id) ?? 0), 0);
  const totalPoints = computeTeamSquadPoints(input.lineupIds, input.benchIds, input.pointsById);
  return {
    lineupPoints,
    benchPoints: totalPoints - lineupPoints,
    totalPoints,
  };
}

async function loadWkPlayerPointsByCsvId(roundNumber?: number): Promise<Map<string, number>> {
  const csvPath = path.join(process.cwd(), "data", "players-wk.csv");
  const csvContent = await readFile(csvPath, "utf-8");
  const csvPlayers = parsePlayerCsv(csvContent).players;
  const matched = await buildWkPlayerPointsByCsvId(csvPlayers, roundNumber);
  const combined = new Map<string, number>();
  const playerIds = new Set<string>([
    ...Array.from(matched.roundPoints.keys()),
    ...Array.from(matched.advancementPoints.keys()),
  ]);

  for (const playerId of playerIds) {
    combined.set(
      playerId,
      (matched.roundPoints.get(playerId) ?? 0) + (matched.advancementPoints.get(playerId) ?? 0),
    );
  }

  return combined;
}

export async function recalculateManagerRoundScorePersistent(input: {
  scope: TeamScoreScope;
  managerKey: string;
  roundNumber: number;
  roundPointsByPlayerId?: Map<string, number>;
  source?: string;
}): Promise<TeamScoreRoundSnapshot> {
  const snapshot = await readManagerStateForRoundPersistent(input.roundNumber, input.scope, input.managerKey);
  const pointsById = input.roundPointsByPlayerId ?? await loadWkPlayerPointsByCsvId(input.roundNumber);
  const computed = computeTeamRoundScore({
    lineupIds: snapshot.lineupIds,
    benchIds: snapshot.benchIds,
    pointsById,
  });

  return saveManagerRoundScoreSnapshotPersistent(input.scope, input.managerKey, {
    roundNumber: input.roundNumber,
    lineupIds: snapshot.lineupIds,
    benchIds: snapshot.benchIds,
    lineupPoints: computed.lineupPoints,
    benchPoints: computed.benchPoints,
    totalPoints: computed.totalPoints,
    calculatedAt: new Date().toISOString(),
    source: input.source ?? "wk-events-v1",
  });
}

export async function recalculateAllManagerRoundScoresPersistent(input: {
  scope: TeamScoreScope;
  roundNumber: number;
  managerKeys?: string[];
}) {
  const managerKeys = input.managerKeys ?? await listAcceptedManagerEmails(input.scope);
  const roundPointsByPlayerId = await loadWkPlayerPointsByCsvId(input.roundNumber);
  const snapshots: TeamScoreRoundSnapshot[] = [];
  for (const managerKey of managerKeys) {
    snapshots.push(
      await recalculateManagerRoundScorePersistent({
        scope: input.scope,
        managerKey,
        roundNumber: input.roundNumber,
        roundPointsByPlayerId,
      }),
    );
  }
  return snapshots;
}

export async function backfillAllManagerScoresThroughLatestRoundPersistent(scope: TeamScoreScope) {
  const latestRound = await getLatestSyncRound();
  if (!latestRound || latestRound <= 0) {
    return { latestRound: null, recalculatedManagersCount: 0, recalculatedRounds: 0 };
  }

  const managerKeys = await listAcceptedManagerEmails(scope);
  for (let roundNumber = 1; roundNumber <= latestRound; roundNumber += 1) {
    await recalculateAllManagerRoundScoresPersistent({ scope, roundNumber, managerKeys });
  }

  return {
    latestRound,
    recalculatedManagersCount: managerKeys.length,
    recalculatedRounds: latestRound,
  };
}

export async function listAcceptedManagerEmails(scope: TeamScoreScope): Promise<string[]> {
  const config = await getLeagueAdminConfigPersistent(scope as LeagueMode);
  return config.participants
    .filter((participant) => participant.status === "ACCEPTED")
    .map((participant) => participant.email.trim().toLowerCase())
    .filter(Boolean);
}

export async function getManagerScoreSummaryPersistent(scope: TeamScoreScope, managerKey: string) {
  return summarizeManagerTeamScoresPersistent(scope, managerKey);
}

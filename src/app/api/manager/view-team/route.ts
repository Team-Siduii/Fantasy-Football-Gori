import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { parsePlayerCsv } from "@/domain/player-csv";
import { getTransferBudgetCapMillions } from "@/domain/team-budget";
import { ensureAuthStateFromDb, getProfileByEmail } from "@/lib/auth-store";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { repairManagerTeamFromDraftArtifactsPersistent } from "@/lib/draft-manager-sync";
import { readTeamViewSnapshotPersistent } from "@/lib/manager-team-state-source";
import { type ManagerStateScope } from "@/lib/manager-state";
import { loadPlayerPoints } from "@/lib/player-points-store";
import { getManagerRoundScorePersistent, summarizeManagerTeamScoresPersistent } from "@/lib/team-score-state";
import { getWkActiveTeamsForRound, isWkPlayerInactiveForRound } from "../../../../lib/wk-player-availability";
import { buildWkPlayerPointsByCsvId } from "@/lib/wk-player-scoring";

const SUBPOULE_BY_EMAIL: Record<string, string> = {
  "s.j.m.duindam@gmail.com": "A",
  "johan201@hotmail.com": "A",
  "thomasbart91@gmail.com": "A",
  "jackvandereep@hotmail.com": "A",
  "emielzomerdijk@gmail.com": "A",
  "ice.eckmund@gmail.com": "A",
};

type TeamViewPlayer = {
  id: string;
  naam: string;
  positie: string;
  club: string;
  prijs: number;
  punten: number;
  totalPoints: number;
  roundPoints: number;
  advancementPoints: number;
  inactive?: boolean;
};

export async function GET(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const targetEmail = url.searchParams.get("email")?.trim().toLowerCase();
  if (!targetEmail) {
    return NextResponse.json({ error: "Geen email opgegeven" }, { status: 400 });
  }

  const userSubpoule = SUBPOULE_BY_EMAIL[email] ?? "A";
  const targetSubpoule = SUBPOULE_BY_EMAIL[targetEmail] ?? "A";
  if (userSubpoule !== targetSubpoule) {
    return NextResponse.json({ error: "Niet in dezelfde subpoule" }, { status: 403 });
  }

  await ensureAuthStateFromDb();

  const scope: ManagerStateScope = url.searchParams.get("mode") === "wk" ? "wk" : "eredivisie";
  const roundNumber = Number(url.searchParams.get("roundNumber") ?? "");
  const isOwnTeam = email === targetEmail;

  let allPlayers;
  if (scope === "wk") {
    const wkCsvPath = path.join(process.cwd(), "data", "players-wk.csv");
    try {
      const csvContent = await readFile(wkCsvPath, "utf-8");
      allPlayers = parsePlayerCsv(csvContent).players;
    } catch {
      return NextResponse.json({ error: "Spelersdata niet beschikbaar" }, { status: 500 });
    }
  } else {
    const { bootstrapPlayersFromDefaultCsv } = await import("@/lib/player-bootstrap");
    const { listPlayers } = await import("@/lib/player-store");
    await bootstrapPlayersFromDefaultCsv();
    allPlayers = listPlayers();
  }

  const playerById = new Map(allPlayers.map((p) => [p.id, p]));

  await repairManagerTeamFromDraftArtifactsPersistent({ managerEmail: targetEmail, scope });

  const playerPointsMap = new Map<string, number>();
  const playerTotalPointsMap = new Map<string, number>();
  const playerAdvancementPointsMap = new Map<string, number>();
  let hasAvailabilitySnapshot = false;
  const activePlayerIds = new Set<string>();
  const activeTeamsForRound = scope === "wk"
    ? await getWkActiveTeamsForRound(Number.isInteger(roundNumber) && roundNumber > 0 ? roundNumber : undefined)
    : null;
  if (scope === "wk") {
    const wkRound = Number.isInteger(roundNumber) && roundNumber > 0 ? roundNumber : undefined;
    const nameMatched = await buildWkPlayerPointsByCsvId(allPlayers, wkRound);
    hasAvailabilitySnapshot = nameMatched.totalPoints.size > 0;
    for (const [csvId, pts] of nameMatched.roundPoints.entries()) {
      playerPointsMap.set(csvId, pts);
      activePlayerIds.add(csvId);
    }
    for (const [csvId, pts] of nameMatched.totalPoints.entries()) {
      playerTotalPointsMap.set(csvId, pts);
      activePlayerIds.add(csvId);
    }
    for (const [csvId, pts] of nameMatched.advancementPoints.entries()) {
      playerAdvancementPointsMap.set(csvId, pts);
      activePlayerIds.add(csvId);
    }
  } else {
    const pointsSnapshot = await loadPlayerPoints(scope);
    if (pointsSnapshot) {
      for (const pp of pointsSnapshot.players) {
        if (pp.fantasyplayerId) {
          playerPointsMap.set(String(pp.fantasyplayerId), pp.totalPoints);
        }
      }
    }
  }

  const state = await readTeamViewSnapshotPersistent({
    scope,
    managerEmail: targetEmail,
    roundNumber,
  });

  const enrichPlayer = (playerId: string): TeamViewPlayer => {
    const player = playerById.get(playerId);
    if (!player) {
      return {
        id: playerId,
        naam: "Onbekend",
        positie: "MID",
        club: "-",
        prijs: 0,
        punten: 0,
        totalPoints: 0,
        roundPoints: 0,
        advancementPoints: 0,
      };
    }
    return {
      ...player,
      inactive: scope === "wk"
        ? (
            isWkPlayerInactiveForRound(player.club, activeTeamsForRound)
            ?? (hasAvailabilitySnapshot ? !activePlayerIds.has(String(playerId)) : player.inactive)
          )
        : player.inactive,
      punten: playerPointsMap.get(String(playerId)) ?? 0,
      totalPoints: playerTotalPointsMap.get(String(playerId)) ?? playerPointsMap.get(String(playerId)) ?? 0,
      roundPoints: playerPointsMap.get(String(playerId)) ?? 0,
      advancementPoints: playerAdvancementPointsMap.get(String(playerId)) ?? 0,
    };
  };

  const lineup: TeamViewPlayer[] = state.lineupIds.map(enrichPlayer);
  const bench: TeamViewPlayer[] = state.benchIds.map((id) => {
    const p = enrichPlayer(id);
    return { ...p, punten: Math.ceil(p.punten / 2) };
  });

  const budgetCap = getTransferBudgetCapMillions(scope);
  const squadCost = [...lineup, ...bench].reduce((sum, p) => sum + (p.prijs ?? 0), 0);
  const budgetRemaining = Math.max(0, budgetCap - squadCost);
  const pendingSellId = isOwnTeam ? state.pendingSellId : null;
  const pendingBuyId = isOwnTeam ? state.pendingBuyId : null;
  const profile = getProfileByEmail(targetEmail);
  const scoreSummary = scope === "wk"
    ? (
        Number.isInteger(roundNumber) && roundNumber > 0
          ? (await getManagerRoundScorePersistent(scope, targetEmail, roundNumber))
              ?? { totalPoints: 0, roundNumber: 0, lineupPoints: 0, benchPoints: 0, lineupIds: [], benchIds: [], calculatedAt: "", source: "" }
          : await summarizeManagerTeamScoresPersistent(scope, targetEmail)
      )
    : {
        totalPoints: lineup.reduce((sum, player) => sum + player.punten, 0) + bench.reduce((sum, player) => sum + player.punten, 0),
        currentRoundPoints: lineup.reduce((sum, player) => sum + player.punten, 0) + bench.reduce((sum, player) => sum + player.punten, 0),
      };

  const selectedWkRound = scope === "wk" && Number.isInteger(roundNumber) && roundNumber > 0;
  const computedSelectedRoundPoints = lineup.reduce((sum, player) => sum + (player.punten ?? 0), 0)
    + lineup.reduce((sum, player) => sum + (player.advancementPoints ?? 0), 0)
    + bench.reduce((sum, player) => sum + (player.punten ?? 0), 0)
    + bench.reduce((sum, player) => sum + Math.ceil((player.advancementPoints ?? 0) / 2), 0);
  const computedSelectedRoundTotalPoints = lineup.reduce((sum, player) => sum + (player.totalPoints ?? player.punten ?? 0), 0)
    + bench.reduce((sum, player) => sum + Math.ceil((player.totalPoints ?? player.punten ?? 0) / 2), 0);
  const teamTotalPoints = selectedWkRound
    ? computedSelectedRoundTotalPoints
    : "totalPoints" in scoreSummary ? scoreSummary.totalPoints : 0;
  const teamRoundPoints = selectedWkRound
    ? computedSelectedRoundPoints
    : "currentRoundPoints" in scoreSummary ? (scoreSummary as { currentRoundPoints: number }).currentRoundPoints : 0;

  return NextResponse.json({
    isOwnTeam,
    teamName: profile?.teamName ?? "Onbekend team",
    managerName: profile?.name ?? targetEmail.split("@")[0],
    roundNumber: scope === "wk" && Number.isInteger(roundNumber) && roundNumber > 0 ? roundNumber : null,
    formation: state.formation,
    lineup,
    bench,
    budgetCap,
    budgetRemaining,
    squadCost,
    pendingSellId,
    pendingBuyId,
    teamTotalPoints,
    teamCurrentRoundPoints: teamRoundPoints,
    scoreSource: scope === "wk" ? "team-score-state" : "player-points",
  });
}

import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { parsePlayerCsv } from "@/domain/player-csv";
import { getTransferBudgetCapMillions } from "@/domain/team-budget";
import { ensureAuthStateFromDb, getProfileByEmail } from "@/lib/auth-store";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { repairManagerTeamFromDraftArtifactsPersistent } from "@/lib/draft-manager-sync";
import { readManagerStatePersistent, type ManagerStateScope } from "@/lib/manager-state";
import { loadPlayerPoints } from "@/lib/player-points-store";
import { summarizeManagerTeamScoresPersistent } from "@/lib/team-score-state";
import { buildWkPlayerTotalPointsMapThroughRound } from "@/lib/wk-player-scoring";
import { resolveCompatibleFormation } from "@/domain/roster-formation";
import { buildFormationSlots } from "@/domain/formation";

const SUBPOULE_BY_EMAIL: Record<string, string> = {
  "s.j.m.duindam@gmail.com": "A",
  "johan201@hotmail.com": "A",
  "thomasbart91@gmail.com": "A",
  "jackvandereep@hotmail.com": "A",
  "emielzomerdijk@gmail.com": "A",
  "ice.eckmund@gmail.com": "A",
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
  if (scope === "wk") {
    const calculatedTotals = await buildWkPlayerTotalPointsMapThroughRound();
    for (const [fantasyplayerId, totalPoints] of calculatedTotals.entries()) {
      playerPointsMap.set(String(fantasyplayerId), totalPoints);
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

  const state = await readManagerStatePersistent(scope, targetEmail);

  const enrichPlayer = (playerId: string) => {
    const player = playerById.get(playerId);
    if (!player) return { id: playerId, naam: "Onbekend", positie: "MID", club: "-", prijs: 0, punten: 0 };
    return {
      ...player,
      punten: playerPointsMap.get(String(playerId)) ?? 0,
    };
  };

  const lineup = state.lineupIds.map(enrichPlayer);
  const bench = state.benchIds.map((id) => {
    const p = enrichPlayer(id);
    return { ...p, punten: Math.ceil(p.punten / 2) };
  });

  // Pas dezelfde compatibiliteitslogica toe als de my-team pagina
  const allSquadPositions = [...lineup, ...bench].map((p) => p.positie);
  const requiredSlotCount = buildFormationSlots(state.formation).flat().length + 4; // 4 bench
  const vacancyCount = Math.max(0, requiredSlotCount - (lineup.length + bench.length));
  const resolvedFormation = resolveCompatibleFormation({
    preferredFormation: state.formation,
    playerPositions: allSquadPositions,
    vacancyCount,
  });

  const budgetCap = getTransferBudgetCapMillions(scope);
  const squadCost = [...lineup, ...bench].reduce((sum, p) => sum + (p.prijs ?? 0), 0);
  const budgetRemaining = Math.max(0, budgetCap - squadCost);
  const pendingSellId = isOwnTeam ? state.pendingSellId : null;
  const pendingBuyId = isOwnTeam ? state.pendingBuyId : null;
  const profile = getProfileByEmail(targetEmail);
  const scoreSummary = scope === "wk"
    ? await summarizeManagerTeamScoresPersistent(scope, targetEmail)
    : {
        totalPoints: lineup.reduce((sum, player) => sum + player.punten, 0) + bench.reduce((sum, player) => sum + player.punten, 0),
        currentRoundPoints: lineup.reduce((sum, player) => sum + player.punten, 0) + bench.reduce((sum, player) => sum + player.punten, 0),
      };

  return NextResponse.json({
    isOwnTeam,
    teamName: profile?.teamName ?? "Onbekend team",
    managerName: profile?.name ?? targetEmail.split("@")[0],
    formation: resolvedFormation,
    lineup,
    bench,
    budgetCap,
    budgetRemaining,
    squadCost,
    pendingSellId,
    pendingBuyId,
    teamTotalPoints: scoreSummary.totalPoints,
    teamCurrentRoundPoints: scoreSummary.currentRoundPoints,
    scoreSource: scope === "wk" ? "team-score-state" : "player-points",
  });
}

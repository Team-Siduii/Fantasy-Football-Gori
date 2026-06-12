import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { parsePlayerCsv } from "@/domain/player-csv";
import { AUTH_TEST_ACCOUNT_PRESETS } from "@/lib/auth-test-accounts";
import { ensureAuthStateFromDb, getProfileByEmail } from "@/lib/auth-store";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { getLeagueAdminConfigPersistent } from "@/lib/league-admin-config";
import { readManagerStatePersistent, type ManagerStateScope } from "@/lib/manager-state";
import { syncManagerTeamFromDraftRosterPersistent } from "@/lib/draft-manager-sync";
import { loadPlayerPoints } from "@/lib/player-points-store";
import { getWkPlayerPoints } from "@/lib/wk-sync-store";
import { computeTeamSquadPoints } from "@/lib/player-derived";
import { WORLD_CUP_2026_FIXTURES } from "@/lib/world-cup-schedule";

const SUBPOULE_BY_EMAIL: Record<string, string> = {
  "s.j.m.duindam@gmail.com": "A",
  "johan201@hotmail.com": "A",
  "thomasbart91@gmail.com": "A",
  "jackvandereep@hotmail.com": "A",
  "emielzomerdijk@gmail.com": "A",
  "ice.eckmund@gmail.com": "A",
};

const DEFAULT_BUDGET_CAP = 100;

function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function getCurrentRoundWk(): number {
  const now = new Date();
  // WK rounds: 1 (MD1), 2 (MD2), 3 (MD3)
  // Find the highest round where at least one match has finished
  const roundsWithFinishedMatches = new Set<number>();
  for (const fixture of WORLD_CUP_2026_FIXTURES) {
    const kickoff = new Date(fixture.kickoffAt);
    // Match duurt ~2 uur, dus als kickoff + 2h < now, is de match klaar
    const matchEnd = new Date(kickoff.getTime() + 2 * 60 * 60 * 1000);
    if (matchEnd < now) {
      roundsWithFinishedMatches.add(fixture.round);
    }
  }
  if (roundsWithFinishedMatches.size === 0) return 0; // Nog geen wedstrijden gespeeld
  return Math.max(...roundsWithFinishedMatches);
}

async function loadPlayers(scope: ManagerStateScope) {
  if (scope === "wk") {
    const wkCsvPath = path.join(process.cwd(), "data", "players-wk.csv");
    try {
      const csvContent = await readFile(wkCsvPath, "utf-8");
      return parsePlayerCsv(csvContent).players;
    } catch {
      return [];
    }
  }
  // Eredivisie: use player store
  const { bootstrapPlayersFromDefaultCsv } = await import("@/lib/player-bootstrap");
  const { listPlayers } = await import("@/lib/player-store");
  await bootstrapPlayersFromDefaultCsv();
  return listPlayers();
}

type RankingEntry = {
  managerId: string;
  displayName: string;
  teamName: string;
  email: string;
  subpoule: string;
  totalPoints: number;
  currentRoundPoints: number;
  budgetRemaining: number;
};

export async function GET(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAuthStateFromDb();

  const url = new URL(request.url);
  const scope: ManagerStateScope = url.searchParams.get("mode") === "wk" ? "wk" : "eredivisie";
  const currentRound = scope === "wk" ? getCurrentRoundWk() : 0;

  // Load players (for prices)
  const allPlayers = await loadPlayers(scope);
  const playerById = new Map(allPlayers.map((p) => ({ ...p })).map((p) => [p.id, p]));

  // Laad spelerpunten: WK uit WK database (op fantasyplayer_id), Eredivisie uit legacy store
  const playerPointsMap = new Map<number, { total: number; round: number }>();
  if (scope === "wk") {
    const dbPlayers = await getWkPlayerPoints(); // latest round per speler (DISTINCT ON)
    for (const p of dbPlayers) {
      playerPointsMap.set(p.fantasyplayer_id, { total: p.total_points, round: p.round_points });
    }
  } else {
    const pointsSnapshot = await loadPlayerPoints(scope);
    if (pointsSnapshot) {
      for (const pp of pointsSnapshot.players) {
        playerPointsMap.set(pp.fantasyplayerId ?? 0, { total: pp.totalPoints, round: pp.roundPoints });
      }
    }
  }

  // Load league config for budget cap
  const leagueConfig = await getLeagueAdminConfigPersistent(scope);
  const budgetCap = leagueConfig.budget.teamValueCapMillions ?? DEFAULT_BUDGET_CAP;

  // Get manager emails with subpoule membership
  const managerEmails = AUTH_TEST_ACCOUNT_PRESETS
    .filter((preset) => Boolean(SUBPOULE_BY_EMAIL[preset.email.trim().toLowerCase()]))
    .map((preset) => preset.email.trim().toLowerCase());

  // Compute ranking for each manager
  const ranking: RankingEntry[] = [];

  for (const managerEmail of managerEmails) {
    // Forceer sync van draft roster naar manager state
    await syncManagerTeamFromDraftRosterPersistent({ managerEmail, scope });

    const profile = getProfileByEmail(managerEmail);
    const teamName = profile?.teamName ?? "Onbekend team";

    const state = await readManagerStatePersistent(scope, managerEmail);
    const lineupIds = state.lineupIds;
    const benchIds = state.benchIds;
    const squadIds = [...lineupIds, ...benchIds];

    // Bouw punten-map per speler-ID (direct op fantasyplayer_id)
    const roundPointsById = new Map<string, number>();
    const totalPointsById = new Map<string, number>();
    for (const playerId of squadIds) {
      const pts = playerPointsMap.get(parseInt(playerId, 10));
      if (pts) {
        roundPointsById.set(playerId, pts.round);
        totalPointsById.set(playerId, pts.total);
      }
    }

    // Calculate points (bench = helft, afgerond naar boven)
    const currentRoundPoints = computeTeamSquadPoints(lineupIds, benchIds, roundPointsById);
    const totalPoints = computeTeamSquadPoints(lineupIds, benchIds, totalPointsById);

    let squadCost = 0;
    for (const playerId of squadIds) {
      const player = playerById.get(playerId);
      if (player) {
        squadCost += player.prijs ?? 0;
      }
    }

    const budgetRemaining = Math.max(0, budgetCap - squadCost);

    ranking.push({
      managerId: managerEmail.split("@")[0],
      displayName: profile?.name ?? managerEmail.split("@")[0],
      teamName,
      email: managerEmail,
      subpoule: SUBPOULE_BY_EMAIL[managerEmail] ?? "A",
      totalPoints: Math.round(totalPoints * 10) / 10,
      currentRoundPoints: Math.round(currentRoundPoints * 10) / 10,
      budgetRemaining: Math.round(budgetRemaining * 10) / 10,
    });
  }

  // Sort by total points descending
  ranking.sort((a, b) => b.totalPoints - a.totalPoints || a.teamName.localeCompare(b.teamName));

  // Group by subpoule
  const bySubpoule = new Map<string, RankingEntry[]>();
  for (const entry of ranking) {
    const poule = entry.subpoule;
    if (!bySubpoule.has(poule)) bySubpoule.set(poule, []);
    bySubpoule.get(poule)!.push(entry);
  }

  // Find the user's subpoule
  const userEmail = email.trim().toLowerCase();
  const userEntry = ranking.find((e) => e.email === userEmail);
  const userSubpoule = userEntry?.subpoule ?? "A";
  const userPouleRanking = bySubpoule.get(userSubpoule) ?? [];

  return NextResponse.json({
    mode: scope,
    currentRound,
    userSubpoule,
    userEmail,
    leagueName: leagueConfig.competition.name,
    ranking: userPouleRanking,
    allSubpoules: Object.fromEntries(bySubpoule),
  });
}

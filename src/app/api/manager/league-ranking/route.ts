import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { parsePlayerCsv } from "@/domain/player-csv";
import { getTransferBudgetCapMillions } from "@/domain/team-budget";
import { AUTH_TEST_ACCOUNT_PRESETS } from "@/lib/auth-test-accounts";
import { ensureAuthStateFromDb, getProfileByEmail } from "@/lib/auth-store";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { getLeagueAdminConfigPersistent } from "@/lib/league-admin-config";
import { readManagerStatePersistent, type ManagerStateScope } from "@/lib/manager-state";
import { loadPlayerPoints } from "@/lib/player-points-store";
import { WORLD_CUP_2026_FIXTURES } from "@/lib/world-cup-schedule";

const SUBPOULE_BY_EMAIL: Record<string, string> = {
  "s.j.m.duindam@gmail.com": "A",
  "johan201@hotmail.com": "A",
  "thomasbart91@gmail.com": "A",
  "jackvandereep@hotmail.com": "A",
  "emielzomerdijk@gmail.com": "A",
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

  // Load player points for current round
  const pointsSnapshot = await loadPlayerPoints(scope);
  const playerPointsMap = new Map<string, { total: number; round: number }>();
  if (pointsSnapshot) {
    for (const pp of pointsSnapshot.players) {
      const key = normalizePlayerName(pp.playerName);
      playerPointsMap.set(key, { total: pp.totalPoints, round: pp.roundPoints });
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
    const profile = getProfileByEmail(managerEmail);
    const teamName = profile?.teamName ?? "Onbekend team";

    const state = await readManagerStatePersistent(scope, managerEmail);
    const squadIds = [...state.lineupIds, ...state.benchIds];

    // Calculate points
    let totalPoints = 0;
    let currentRoundPoints = 0;
    let squadCost = 0;

    for (const playerId of squadIds) {
      const player = playerById.get(playerId);
      if (player) {
        squadCost += player.prijs ?? 0;
      }

      // Lookup points by name
      if (player) {
        const key = normalizePlayerName(player.naam);
        const pts = playerPointsMap.get(key);
        if (pts) {
          totalPoints += pts.total;
          currentRoundPoints += pts.round;
        }
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
    ranking: userPouleRanking,
    allSubpoules: Object.fromEntries(bySubpoule),
  });
}

import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { parsePlayerCsv } from "@/domain/player-csv";
import { getTransferBudgetCapMillions } from "@/domain/team-budget";
import { ensureAuthStateFromDb, getProfileByEmail } from "@/lib/auth-store";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { syncManagerTeamFromDraftRosterPersistent } from "@/lib/draft-manager-sync";
import { readManagerStatePersistent, type ManagerStateScope } from "@/lib/manager-state";
import { loadPlayerPoints } from "@/lib/player-points-store";
import { getWkPlayerPoints } from "@/lib/wk-sync-store";

const SUBPOULE_BY_EMAIL: Record<string, string> = {
  "s.j.m.duindam@gmail.com": "A",
  "johan201@hotmail.com": "A",
  "thomasbart91@gmail.com": "A",
  "jackvandereep@hotmail.com": "A",
  "emielzomerdijk@gmail.com": "A",
  "ice.eckmund@gmail.com": "A",
};

function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

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

  // Alleen managers in dezelfde subpoule mogen elkaars team zien
  const userSubpoule = SUBPOULE_BY_EMAIL[email] ?? "A";
  const targetSubpoule = SUBPOULE_BY_EMAIL[targetEmail] ?? "A";
  if (userSubpoule !== targetSubpoule) {
    return NextResponse.json({ error: "Niet in dezelfde subpoule" }, { status: 403 });
  }

  await ensureAuthStateFromDb();

  const scope: ManagerStateScope = url.searchParams.get("mode") === "wk" ? "wk" : "eredivisie";
  const isOwnTeam = email === targetEmail;

  // Load players
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

  // Laad spelerpunten: WK uit WK database, Eredivisie uit legacy store
  const playerPointsMap = new Map<string, number>();
  if (scope === "wk") {
    const dbPlayers = await getWkPlayerPoints(); // latest round per speler
    for (const p of dbPlayers) {
      playerPointsMap.set(normalizePlayerName(p.name), p.total_points);
    }
  } else {
    const pointsSnapshot = await loadPlayerPoints(scope);
    if (pointsSnapshot) {
      for (const pp of pointsSnapshot.players) {
        playerPointsMap.set(normalizePlayerName(pp.playerName), pp.totalPoints);
      }
    }
  }

  // Sync draft roster naar state voor deze manager (veiligheid)
  await syncManagerTeamFromDraftRosterPersistent({ managerEmail: targetEmail, scope });

  // Load target manager state (alleen huidige ronde, niet toekomst)
  const state = await readManagerStatePersistent(scope, targetEmail);

  // Build player details for lineup + bench
  const enrichPlayer = (playerId: string) => {
    const player = playerById.get(playerId);
    if (!player) return { id: playerId, naam: "Onbekend", positie: "MID", club: "-", prijs: 0, punten: 0 };
    const key = normalizePlayerName(player.naam);
    return {
      ...player,
      punten: playerPointsMap.get(key) ?? 0,
    };
  };

  const lineup = state.lineupIds.map(enrichPlayer);
  const bench = state.benchIds.map((id) => {
    const p = enrichPlayer(id);
    return { ...p, punten: Math.ceil(p.punten / 2) };
  });

  // Budget
  const budgetCap = getTransferBudgetCapMillions(scope);
  const squadCost = [...lineup, ...bench].reduce((sum, p) => sum + (p.prijs ?? 0), 0);
  const budgetRemaining = Math.max(0, budgetCap - squadCost);

  // Alleen eigen team: toon transfer-info
  const pendingSellId = isOwnTeam ? state.pendingSellId : null;
  const pendingBuyId = isOwnTeam ? state.pendingBuyId : null;

  const profile = getProfileByEmail(targetEmail);

  return NextResponse.json({
    isOwnTeam,
    teamName: profile?.teamName ?? "Onbekend team",
    managerName: profile?.name ?? targetEmail.split("@")[0],
    formation: state.formation,
    lineup,
    bench,
    budgetCap,
    budgetRemaining,
    squadCost,
    pendingSellId,
    pendingBuyId,
  });
}

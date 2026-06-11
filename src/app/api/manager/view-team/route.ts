     1|import { readFile } from "fs/promises";
     2|import path from "path";
     3|import { NextResponse } from "next/server";
     4|import { parsePlayerCsv } from "@/domain/player-csv";
     5|import { getTransferBudgetCapMillions } from "@/domain/team-budget";
     6|import { ensureAuthStateFromDb, getProfileByEmail } from "@/lib/auth-store";
     7|import { getAuthenticatedEmail } from "@/lib/auth-session";
     8|import { readManagerStatePersistent, type ManagerStateScope } from "@/lib/manager-state";
     9|import { loadPlayerPoints } from "@/lib/player-points-store";
    10|
    11|const SUBPOULE_BY_EMAIL: Record<string, string> = {
    12|  "s.j.m.duindam@gmail.com": "A",
    13|  "johan201@hotmail.com": "A",
    14|  "thomasbart91@gmail.com": "A",
    15|  "jackvandereep@hotmail.com": "A",
    16|  "emielzomerdijk@gmail.com": "A",
    17|};
    18|
    19|function normalizePlayerName(name: string): string {
    20|  return name
    21|    .normalize("NFD")
    22|    .replace(/\p{Diacritic}/gu, "")
    23|    .toLowerCase()
    24|    .trim();
    25|}
    26|
    27|export async function GET(request: Request) {
    28|  const email = await getAuthenticatedEmail();
    29|  if (!email) {
    30|    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    31|  }
    32|
    33|  const url = new URL(request.url);
    34|  const targetEmail = url.searchParams.get("email")?.trim().toLowerCase();
    35|  if (!targetEmail) {
    36|    return NextResponse.json({ error: "Geen email opgegeven" }, { status: 400 });
    37|  }
    38|
    39|  // Alleen managers in dezelfde subpoule mogen elkaars team zien
    40|  const userSubpoule = SUBPOULE_BY_EMAIL[email] ?? "A";
    41|  const targetSubpoule = SUBPOULE_BY_EMAIL[targetEmail] ?? "A";
    42|  if (userSubpoule !== targetSubpoule) {
    43|    return NextResponse.json({ error: "Niet in dezelfde subpoule" }, { status: 403 });
    44|  }
    45|
    46|  await ensureAuthStateFromDb();
    47|
    48|  const scope: ManagerStateScope = url.searchParams.get("mode") === "wk" ? "wk" : "eredivisie";
    49|  const isOwnTeam = email === targetEmail;
    50|
    51|  // Load players
    52|  let allPlayers;
    53|  if (scope === "wk") {
    54|    const wkCsvPath = path.join(process.cwd(), "data", "players-wk.csv");
    55|    try {
    56|      const csvContent = await readFile(wkCsvPath, "utf-8");
    57|      allPlayers = parsePlayerCsv(csvContent).players;
    58|    } catch {
    59|      return NextResponse.json({ error: "Spelersdata niet beschikbaar" }, { status: 500 });
    60|    }
    61|  } else {
    62|    const { bootstrapPlayersFromDefaultCsv } = await import("@/lib/player-bootstrap");
    63|    const { listPlayers } = await import("@/lib/player-store");
    64|    await bootstrapPlayersFromDefaultCsv();
    65|    allPlayers = listPlayers();
    66|  }
    67|
    68|  const playerById = new Map(allPlayers.map((p) => [p.id, p]));
    69|
    70|  // Load player points
    71|  const pointsSnapshot = await loadPlayerPoints(scope);
    72|  const playerPointsMap = new Map<string, number>();
    73|  if (pointsSnapshot) {
    74|    for (const pp of pointsSnapshot.players) {
    75|      playerPointsMap.set(normalizePlayerName(pp.playerName), pp.totalPoints);
    76|    }
    77|  }
    78|
    79|  // Load target manager state (alleen huidige ronde, niet toekomst)
    80|  const state = await readManagerStatePersistent(scope, targetEmail);
    81|
    82|  // Build player details for lineup + bench
    83|  const enrichPlayer = (playerId: string) => {
    84|    const player = playerById.get(playerId);
    85|    if (!player) return { id: playerId, naam: "Onbekend", positie: "MID", club: "-", prijs: 0, punten: 0 };
    86|    const key = normalizePlayerName(player.naam);
    87|    return {
    88|      ...player,
    89|      punten: playerPointsMap.get(key) ?? 0,
    90|    };
    91|  };
    92|
    93|  const lineup = state.lineupIds.map(enrichPlayer);
    94|  const bench = state.benchIds.map(enrichPlayer);
    95|
    96|  // Budget
    97|  const budgetCap = getTransferBudgetCapMillions(scope);
    98|  const squadCost = [...lineup, ...bench].reduce((sum, p) => sum + (p.prijs ?? 0), 0);
    99|  const budgetRemaining = Math.max(0, budgetCap - squadCost);
   100|
   101|  // Alleen eigen team: toon transfer-info
   102|  const pendingSellId = isOwnTeam ? state.pendingSellId : null;
   103|  const pendingBuyId = isOwnTeam ? state.pendingBuyId : null;
   104|
   105|  const profile = getProfileByEmail(targetEmail);
   106|
   107|  return NextResponse.json({
   108|    isOwnTeam,
   109|    teamName: profile?.teamName ?? "Onbekend team",
   110|    managerName: profile?.name ?? targetEmail.split("@")[0],
   111|    formation: state.formation,
   112|    lineup,
   113|    bench,
   114|    budgetCap,
   115|    budgetRemaining,
   116|    squadCost,
   117|    pendingSellId,
   118|    pendingBuyId,
   119|  });
   120|}
   121|
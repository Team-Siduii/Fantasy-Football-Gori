import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { parsePlayerCsv } from "@/domain/player-csv";
import { bootstrapPlayersFromDefaultCsv } from "@/lib/player-bootstrap";
import { listPlayers } from "@/lib/player-store";
import { getLeagueAdminConfigPersistent } from "@/lib/league-admin-config";
import { listCalculatedWkPlayerPoints } from "@/lib/wk-player-scoring";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = (url.searchParams.get("mode") ?? "eredivisie").toLowerCase();
  const roundParam = url.searchParams.get("round");
  const roundSequence = roundParam ? Number(roundParam) : undefined;

  if (mode === "wk") {
    const wkCsvPath = path.join(process.cwd(), "data", "players-wk.csv");
    let csvPlayers: ReturnType<typeof parsePlayerCsv>["players"] = [];

    try {
      const csvContent = await readFile(wkCsvPath, "utf-8");
      const parsed = parsePlayerCsv(csvContent);
      csvPlayers = parsed.players;
    } catch {
      return NextResponse.json({ count: 0, players: [] }, { headers: NO_CACHE_HEADERS });
    }

    let calculatedPlayers: Awaited<ReturnType<typeof listCalculatedWkPlayerPoints>> = [];
    let syncStatus: string | undefined;
    try {
      calculatedPlayers = await listCalculatedWkPlayerPoints(roundSequence);
    } catch {
      syncStatus = "unavailable — WK scoring storage read failed";
    }

    let priceOffset = 0;
    try {
      const leagueConfig = await getLeagueAdminConfigPersistent("wk");
      priceOffset = leagueConfig.budget.priceOffsetMillions ?? 0;
    } catch {
      // default 0
    }

    const hasAvailabilitySnapshot = calculatedPlayers.length > 0;
    const calculatedById = new Map<number, (typeof calculatedPlayers)[number]>();
    for (const player of calculatedPlayers) {
      calculatedById.set(player.fantasyplayerId, player);
    }

    const playersWithPoints = csvPlayers.map((csv) => {
      const playerId = parseInt(csv.id, 10);
      const calculated = calculatedById.get(playerId);
      const adjustedPrice = Math.max(0, csv.prijs - priceOffset);

      return {
        ...csv,
        prijs: adjustedPrice,
        inactive: hasAvailabilitySnapshot ? !calculated : undefined,
        isActive: Boolean(calculated),
        punten: calculated?.totalPoints ?? 0,
        totalPoints: calculated?.totalPoints ?? 0,
        roundPoints: calculated?.roundPoints ?? 0,
        advancementPoints: calculated?.advancementPoints ?? 0,
        pointEvents: calculated?.pointEvents ?? [],
        scoreSource: calculated?.source ?? "wk-events-v1",
      };
    });

    return NextResponse.json({
      count: playersWithPoints.length,
      players: playersWithPoints,
      syncStatus,
    }, { headers: NO_CACHE_HEADERS });
  }

  await bootstrapPlayersFromDefaultCsv();

  return NextResponse.json({
    count: listPlayers().length,
    players: listPlayers(),
  }, { headers: NO_CACHE_HEADERS });
}

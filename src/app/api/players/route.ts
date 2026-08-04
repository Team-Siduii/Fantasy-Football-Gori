import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { parsePlayerCsv } from "@/domain/player-csv";
import { bootstrapPlayersFromDefaultCsv } from "@/lib/player-bootstrap";
import { listPlayers } from "@/lib/player-store";
import { listCalculatedWkPlayerPoints } from "@/lib/wk-player-scoring";
import { getWkMatches } from "@/lib/wk-sync-store";
import { applyWkPlayerAvailabilityAndPoints } from "../../../lib/wk-availability";
import { applyWkTransferPriceOffsetMillions } from "../../../lib/wk-price";

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
    let wkMatches: Awaited<ReturnType<typeof getWkMatches>> = [];
    let syncStatus: string | undefined;
    try {
      [calculatedPlayers, wkMatches] = await Promise.all([
        listCalculatedWkPlayerPoints(roundSequence),
        getWkMatches(),
      ]);
    } catch {
      syncStatus = "unavailable — WK scoring storage read failed";
    }

    const playersWithPoints = applyWkPlayerAvailabilityAndPoints({
      csvPlayers: csvPlayers.map((csv) => ({
        ...csv,
        prijs: applyWkTransferPriceOffsetMillions(csv.prijs),
      })),
      calculatedPlayers,
      matches: wkMatches,
      roundNumber: roundSequence,
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

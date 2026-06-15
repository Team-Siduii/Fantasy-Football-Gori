import { NextResponse } from "next/server";
import { getLatestSyncRound } from "@/lib/wk-sync-store";
import { listCalculatedWkPlayerPoints } from "@/lib/wk-player-scoring";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roundParam = url.searchParams.get("round");
    const roundSequence = roundParam ? Number(roundParam) : undefined;
    const latestSyncRound = await getLatestSyncRound();
    const players = await listCalculatedWkPlayerPoints(roundSequence);

    if (players.length === 0) {
      return NextResponse.json({
        count: 0,
        players: [],
        source: "db-events",
        syncStatus: "empty — run GET /api/wk/sync-points first",
        lastSyncRound: latestSyncRound,
      }, { headers: NO_CACHE_HEADERS });
    }

    const teams = [...new Set(players.map((p) => p.teamName))].sort();
    const positions = [...new Set(players.map((p) => p.positionNl))].sort();

    return NextResponse.json({
      count: players.length,
      players,
      teams,
      positions,
      source: "db-events",
      syncStatus: "ok",
      lastSyncRound: latestSyncRound,
      lastSyncedAt: null,
    }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[wk/players] Error:", error);
    return NextResponse.json(
      { error: "Failed to read WK players from database", count: 0, players: [] },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }
}

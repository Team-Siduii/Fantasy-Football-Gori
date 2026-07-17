import { NextResponse } from "next/server";
import { getLatestSyncRound } from "@/lib/wk-sync-store";
import { listCalculatedWkPlayerPoints } from "@/lib/wk-player-scoring";

function normalizeMatchKey(name: string, team: string) {
  return `${name.trim().toLowerCase()}|${team.trim().toLowerCase()}`;
}

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
    let responsePlayers = players;

    if (roundSequence && roundSequence > 1) {
      const previousRoundPlayers = await listCalculatedWkPlayerPoints(roundSequence - 1);
      const previousByKey = new Map(
        previousRoundPlayers.map((player) => [normalizeMatchKey(player.name, player.teamName), player]),
      );
      responsePlayers = players.map((player) => {
        const previous = previousByKey.get(normalizeMatchKey(player.name, player.teamName));
        return {
          ...player,
          advancementPoints: previous
            ? Math.max(0, player.advancementPoints - previous.advancementPoints)
            : player.advancementPoints,
        };
      });
    }

    if (responsePlayers.length === 0) {
      return NextResponse.json({
        count: 0,
        players: [],
        source: "db-events",
        syncStatus: "empty — run GET /api/wk/sync-points first",
        lastSyncRound: latestSyncRound,
      }, { headers: NO_CACHE_HEADERS });
    }

    const teams = [...new Set(responsePlayers.map((p) => p.teamName))].sort();
    const positions = [...new Set(responsePlayers.map((p) => p.positionNl))].sort();

    return NextResponse.json({
      count: responsePlayers.length,
      players: responsePlayers,
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
      {
        error: "Failed to read WK players from database",
        count: 0,
        players: [],
        teams: [],
        positions: [],
        source: "db-events",
        syncStatus: "unavailable — database read failed",
        lastSyncRound: await getLatestSyncRound().catch(() => null),
        lastSyncedAt: null,
      },
      { headers: NO_CACHE_HEADERS },
    );
  }
}

import { NextResponse } from "next/server";
import { getWkPlayerPoints, getWkPlayerEvents, getWkMatches, getLatestSyncRound, applyDefenderCleanSheetBonus } from "@/lib/wk-sync-store";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roundParam = url.searchParams.get("round");
    const roundSequence = roundParam ? Number(roundParam) : undefined; // undefined = latest

    // Read from our own database
    const dbPlayers = await getWkPlayerPoints(roundSequence);
    const latestSyncRound = await getLatestSyncRound();

    if (dbPlayers.length === 0) {
      return NextResponse.json({
        count: 0,
        players: [],
        source: "db",
        syncStatus: "empty — run GET /api/wk/sync-points first",
        lastSyncRound: null,
      }, { headers: NO_CACHE_HEADERS });
    }

    // Get events for these players
    const effectiveRound = roundSequence ?? latestSyncRound ?? 1;
    const dbEvents = await getWkPlayerEvents(effectiveRound);
    const eventsByPlayer = new Map<number, Array<{ eventCode: string; points: number; minute: number | null }>>();
    for (const ev of dbEvents) {
      const arr = eventsByPlayer.get(ev.fantasyplayer_id) || [];
      arr.push({ eventCode: ev.event_code, points: ev.points, minute: ev.minute });
      eventsByPlayer.set(ev.fantasyplayer_id, arr);
    }

    const players = dbPlayers.map((p) => {
      const base = {
        fantasyplayerId: p.fantasyplayer_id,
        name: p.name,
        teamName: p.team_name,
        teamCode: p.team_code,
        position: p.position,
        positionNl: p.position_nl,
        value: p.value,
        roundPoints: p.round_points,
        totalPoints: p.total_points,
        hasPlayed: p.has_played,
        numPlayed: p.num_played,
        pointEvents: eventsByPlayer.get(p.fantasyplayer_id) || [],
      };
      return applyDefenderCleanSheetBonus(base, p.position, p.position_nl);
    });

    const teams = [...new Set(players.map((p) => p.teamName))].sort();
    const positions = [...new Set(players.map((p) => p.positionNl))].sort();

    return NextResponse.json({
      count: players.length,
      players,
      teams,
      positions,
      source: "db",
      syncStatus: "ok",
      lastSyncRound: latestSyncRound,
      lastSyncedAt: dbPlayers[0]?.synced_at ?? null,
    }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[wk/players] Error:", error);
    return NextResponse.json(
      { error: "Failed to read WK players from database", count: 0, players: [] },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }
}

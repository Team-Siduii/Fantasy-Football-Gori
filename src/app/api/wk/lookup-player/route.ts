import { NextResponse } from "next/server";
import { getWkPlayerPoints } from "@/lib/wk-sync-store";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const idParam = url.searchParams.get("id");
  if (!idParam) {
    return NextResponse.json({ error: "Missing ?id=" }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  
  const targetId = Number(idParam);
  
  try {
    // getWkPlayerPoints returns all players from the latest round
    const allPlayers = await getWkPlayerPoints();
    const found = allPlayers.find((p) => p.fantasyplayer_id === targetId);
    
    if (!found) {
      return NextResponse.json({ 
        found: false, 
        id: targetId,
        totalPlayers: allPlayers.length,
      }, { headers: NO_CACHE_HEADERS });
    }
    
    return NextResponse.json({
      found: true,
      id: found.fantasyplayer_id,
      name: found.name,
      teamName: found.team_name,
      teamCode: found.team_code,
      position: found.position,
      positionNl: found.position_nl,
      value: found.value,
      roundPoints: found.round_points,
      totalPoints: found.total_points,
      hasPlayed: found.has_played,
      numPlayed: found.num_played,
    }, { headers: NO_CACHE_HEADERS });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

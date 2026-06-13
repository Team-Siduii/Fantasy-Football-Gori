import { NextResponse } from "next/server";
import { saveWkPlayerPoints, saveWkPlayerEvents } from "@/lib/wk-sync-store";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

type PlayerPayload = {
  fantasyplayer_id: number;
  name: string;
  team_name: string;
  team_code: string;
  position: string;
  position_nl: string;
  value: number;
  round_points: number;
  total_points: number;
  has_played: boolean;
  num_played: number;
};

type EventPayload = {
  fantasyplayer_id: number;
  event_code: string;
  points: number;
  minute?: number;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { round, players, events } = body as {
      round: number;
      players: PlayerPayload[];
      events?: EventPayload[];
    };

    if (!round || !Array.isArray(players)) {
      return NextResponse.json(
        { error: "Missing round or players array" },
        { status: 400, headers: NO_CACHE_HEADERS },
      );
    }

    // Save player points
    await saveWkPlayerPoints(
      players.map((p) => ({
        fantasyplayer_id: p.fantasyplayer_id,
        round,
        name: p.name,
        team_name: p.team_name,
        team_code: p.team_code,
        position: p.position,
        position_nl: p.position_nl,
        value: p.value,
        round_points: p.round_points,
        total_points: p.total_points,
        has_played: p.has_played,
        num_played: p.num_played,
      })),
    );

    // Save player events
    if (events && events.length > 0) {
      await saveWkPlayerEvents(
        events.map((e) => ({
          fantasyplayer_id: e.fantasyplayer_id,
          round,
          event_code: e.event_code,
          points: e.points,
          minute: e.minute,
        })),
      );
    }

    return NextResponse.json(
      {
        success: true,
        round,
        playersCount: players.length,
        eventsCount: events?.length ?? 0,
        syncedAt: new Date().toISOString(),
      },
      { headers: NO_CACHE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sync-points-ingest error:", message);
    return NextResponse.json(
      { error: "Interne fout", details: message },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }
}

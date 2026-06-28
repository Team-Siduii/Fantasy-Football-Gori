import { NextResponse } from "next/server";
import { saveWkPlayerEvents } from "@/lib/wk-sync-store";
import { recalculateAllManagerRoundScoresPersistent } from "@/lib/team-score-engine";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
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
    const { round, events } = body as {
      round: number;
      events: EventPayload[];
    };

    if (!round || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: "Missing round or events array" },
        { status: 400, headers: NO_CACHE_HEADERS },
      );
    }

    // Save player events ONLY — no player points update
    await saveWkPlayerEvents(
      events.map((e) => ({
        fantasyplayer_id: e.fantasyplayer_id,
        round,
        event_code: e.event_code,
        points: e.points,
        minute: e.minute,
      })),
    );

    // Recalculate team scores for this round
    const recalculatedManagersCount = (
      await recalculateAllManagerRoundScoresPersistent({ scope: "wk", roundNumber: round })
    ).length;

    return NextResponse.json(
      {
        success: true,
        round,
        eventsCount: events.length,
        recalculatedManagersCount,
        syncedAt: new Date().toISOString(),
      },
      { headers: NO_CACHE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sync-points-ingest-events error:", message);
    return NextResponse.json(
      { error: "Interne fout", details: message },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }
}

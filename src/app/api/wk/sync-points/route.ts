import { NextResponse } from "next/server";
import {
  fetchWkcoachAllPlayersWithPoints,
} from "@/lib/data-sources/wkcoach";
import {
  saveWkPlayerPoints,
  saveWkPlayerEvents,
} from "@/lib/wk-sync-store";
import { WORLD_CUP_2026_FIXTURES } from "@/lib/world-cup-schedule";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

function getCurrentOrUpcomingRound(): number {
  const now = new Date();
  const nowMs = now.getTime();

  for (const fixture of WORLD_CUP_2026_FIXTURES) {
    const kickoff = new Date(fixture.kickoffAt).getTime();
    const endEstimate = kickoff + 3 * 60 * 60 * 1000;
    if (nowMs >= kickoff && nowMs <= endEstimate) {
      return fixture.round;
    }
  }

  let nextRound = 1;
  for (const fixture of WORLD_CUP_2026_FIXTURES) {
    const kickoff = new Date(fixture.kickoffAt).getTime();
    if (kickoff > nowMs) {
      return fixture.round;
    }
    nextRound = fixture.round;
  }

  return nextRound;
}

/**
 * Bepaalt of een sync nodig is:
 * - Force=true → altijd syncen
 * - Er is een wedstrijd bezig OF in de afgelopen 3 uur gespeeld → syncen
 * - Anders → overslaan
 */
function shouldSyncNow(round: number, force: boolean): {
  shouldSync: boolean;
  reason: string;
} {
  if (force) return { shouldSync: true, reason: "forced" };

  const now = Date.now();
  const MATCH_DURATION = 2.5 * 60 * 60 * 1000; // 2.5 uur (wedstrijd)
  const POST_MATCH_WINDOW = 6 * 60 * 60 * 1000; // 6 uur na wedstrijd blijven syncen

  for (const fixture of WORLD_CUP_2026_FIXTURES) {
    if (fixture.round !== round) continue;
    const kickoff = new Date(fixture.kickoffAt).getTime();
    const matchEnd = kickoff + MATCH_DURATION;
    const syncDeadline = matchEnd + POST_MATCH_WINDOW;

    // Wedstrijd is bezig of recent afgelopen → syncen
    if (now >= kickoff && now <= syncDeadline) {
      if (now <= matchEnd) return { shouldSync: true, reason: "wedstrijd bezig: " + fixture.home + " vs " + fixture.away };
      return { shouldSync: true, reason: "sync window: " + fixture.home + " vs " + fixture.away };
    }
  }

  return { shouldSync: false, reason: "geen actieve of recente wedstrijden" };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roundParam = url.searchParams.get("round");
    const roundSequence = roundParam ? Number(roundParam) : getCurrentOrUpcomingRound();
    const fullSync = url.searchParams.get("full") !== "false";
    const force = url.searchParams.get("force") === "true";

    // Check of sync nodig is (force bypassed alles)
    console.log("[sync-points] calling shouldSyncNow round=" + roundSequence + " force=" + force);
    const syncCheck = shouldSyncNow(roundSequence, force);
    console.log("[sync-points] shouldSyncNow result: " + JSON.stringify(syncCheck));
    if (!syncCheck.shouldSync) {
      return NextResponse.json(
        {
          success: true,
          skipped: true,
          reason: syncCheck.reason,
        },
        { headers: NO_CACHE_HEADERS },
      );
    }

    if (!Number.isInteger(roundSequence) || roundSequence < 1 || roundSequence > 9) {
      return NextResponse.json(
        { error: "Ongeldig ronde nummer (1-9)" },
        { status: 400, headers: NO_CACHE_HEADERS },
      );
    }

    const email = process.env.WKCOACH_EMAIL;
    const password = process.env.WKCOACH_PASSWORD;

    if (!email || !password) {
      return NextResponse.json(
        { error: "WKCoach credentials niet geconfigureerd" },
        { status: 500, headers: NO_CACHE_HEADERS },
      );
    }

    const syncedAt = new Date().toISOString();
    let playersCount = 0;
    const matchesCount = 0;
    let eventsCount = 0;

    // ── 1. Sync player points via search_all (with point_events!) ──
    if (fullSync) {
      console.log("[sync-points] Starting WKCoach API fetch...");
      let allPlayers: Awaited<ReturnType<typeof fetchWkcoachAllPlayersWithPoints>>;
      try {
        allPlayers = await fetchWkcoachAllPlayersWithPoints({
          email,
          password,
          roundSequence,
          pageSize: 1500,
        });
        console.log("[sync-points] WKCoach API fetch done: " + allPlayers.length + " players");
      } catch (fetchErr) {
        console.error("[sync-points] WKCoach API fetch FAILED:", String(fetchErr));
        return NextResponse.json(
          { error: "WKCoach API fetch failed", details: String(fetchErr) },
          { status: 502, headers: NO_CACHE_HEADERS },
        );
      }

      if (allPlayers.length > 0) {
        // Save player points
        console.log("[sync-points] Saving " + allPlayers.length + " player points...");
        try {
          await saveWkPlayerPoints(
            allPlayers.map((p) => ({
              fantasyplayer_id: p.fantasyplayer_id,
              round: roundSequence,
              name: p.name,
              team_name: p.club_fullname,
              team_code: p.club_codename,
              position: p.position,
              position_nl: p.position_nl,
              value: p.value,
              round_points: p.round_points,
              total_points: p.total_points,
              has_played: p.has_played,
              num_played: p.num_played,
            })),
          );
          console.log("[sync-points] Player points saved");
        } catch (dbErr) {
          console.error("[sync-points] DB save points FAILED:", String(dbErr));
          return NextResponse.json(
            { error: "Database save failed (points)", details: String(dbErr) },
            { status: 502, headers: NO_CACHE_HEADERS },
          );
        }
        playersCount = allPlayers.length;

        // Save player events (point breakdown)
        const allEvents: Array<{
          fantasyplayer_id: number;
          round: number;
          event_code: string;
          points: number;
          minute?: number;
        }> = [];
        for (const p of allPlayers) {
          for (const evt of p.point_events || []) {
            allEvents.push({
              fantasyplayer_id: p.fantasyplayer_id,
              round: roundSequence,
              event_code: evt.event_code,
              points: evt.points,
              minute: evt.minute,
            });
          }
        }
        if (allEvents.length > 0) {
          console.log("[sync-points] Saving " + allEvents.length + " events...");
          try {
            await saveWkPlayerEvents(allEvents);
            console.log("[sync-points] Events saved");
          } catch (evtErr) {
            console.error("[sync-points] DB save events FAILED:", String(evtErr));
            return NextResponse.json(
              { error: "Database save failed (events)", details: String(evtErr) },
              { status: 502, headers: NO_CACHE_HEADERS },
            );
          }
          eventsCount = allEvents.length;
        }

      }
    }

    return NextResponse.json(
      {
        success: true,
        roundSequence,
        syncedAt,
        playersCount,
        eventsCount,
        matchesCount,
        lastSync: syncedAt,
      },
      { headers: NO_CACHE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sync-points error:", message);
    return NextResponse.json(
      { error: "Interne fout", details: message },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }
}

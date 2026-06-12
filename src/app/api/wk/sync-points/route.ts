import { NextResponse } from "next/server";
import {
  fetchWkcoachPointsSnapshot,
  fetchWkcoachAllPlayersWithPoints,
} from "@/lib/data-sources/wkcoach";
import { savePlayerPoints, type PlayerPointsSnapshot } from "@/lib/player-points-store";
import {
  saveWkMatches,
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roundParam = url.searchParams.get("round");
    const roundSequence = roundParam ? Number(roundParam) : getCurrentOrUpcomingRound();
    const fullSync = url.searchParams.get("full") !== "false"; // default: true

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
    let matchesCount = 0;
    let eventsCount = 0;

    // ── 1. Sync player points via search_all (with point_events!) ──
    if (fullSync) {
      const allPlayers = await fetchWkcoachAllPlayersWithPoints({
        email,
        password,
        roundSequence,
        pageSize: 1500, // single page = under Vercel 10s timeout
      });

      if (allPlayers.length > 0) {
        // Save player points
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
          await saveWkPlayerEvents(allEvents);
          eventsCount = allEvents.length;
        }
      }
    }

    // ── 2. Sync match results ──
    // Fetch matches from WKCoach's teams/matches endpoint (same session as points)
    try {
      const ua = "Mozilla/5.0";
      const cookies: Record<string, string> = {};

      // Login directly for match fetch
      function parseSetCookies(header: string | null): Record<string, string> {
        if (!header) return {};
        const c: Record<string, string> = {};
        for (const part of header.split(/,\s*(?=[^;]+?=)/g)) {
          const [kv] = part.split(";");
          const idx = kv.indexOf("=");
          if (idx > 0) c[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
        }
        return c;
      }
      function cookieHeader(c: Record<string, string>): string {
        return Object.entries(c).map(([k, v]) => `${k}=${v}`).join("; ");
      }

      const loginPage = await fetch("https://www.wkcoach.nl/accounts/login/", {
        headers: { "User-Agent": ua }, cache: "no-store",
      });
      Object.assign(cookies, parseSetCookies(loginPage.headers.get("set-cookie")));
      const html = await loginPage.text();
      const csrfMatch = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/);
      const csrf = csrfMatch?.[1] ?? cookies.csrftoken;
      if (csrf) {
        const form = new URLSearchParams();
        form.set("csrfmiddlewaretoken", csrf);
        form.set("login", email);
        form.set("password", password);
        const loginPost = await fetch("https://www.wkcoach.nl/accounts/login/", {
          method: "POST",
          headers: {
            "User-Agent": ua,
            Referer: "https://www.wkcoach.nl/accounts/login/",
            Origin: "https://www.wkcoach.nl",
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: cookieHeader(cookies),
          },
          body: form.toString(), redirect: "manual", cache: "no-store",
        });
        Object.assign(cookies, parseSetCookies(loginPost.headers.get("set-cookie")));

        if (cookies.sessionid) {
          const h = {
            "User-Agent": ua, Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
            Referer: "https://www.wkcoach.nl/app/",
            Cookie: cookieHeader(cookies),
          };
          const matchesRes = await fetch(
            `https://www.wkcoach.nl/api/teams/matches/?round_seq=${roundSequence}`,
            { headers: h, cache: "no-store" },
          );
          if (matchesRes.ok) {
            const matchesData = (await matchesRes.json()) as {
              matches?: Array<{
                id: number;
                round: number;
                home_score: number;
                away_score: number;
                status: string;
                start_date_str?: string;
                home_team?: { full_name: string; codename: string };
                away_team?: { full_name: string; codename: string };
              }>;
            };
            const matches = (matchesData.matches || []).map((m) => ({
              match_id: m.id,
              round: m.round,
              home_team: m.home_team?.full_name ?? "Onbekend",
              away_team: m.away_team?.full_name ?? "Onbekend",
              home_team_code: m.home_team?.codename ?? "",
              away_team_code: m.away_team?.codename ?? "",
              home_score: m.home_score >= 0 ? m.home_score : null,
              away_score: m.away_score >= 0 ? m.away_score : null,
              status: m.status,
              kickoff_at: m.start_date_str ?? null,
            }));
            if (matches.length > 0) {
              await saveWkMatches(matches);
              matchesCount = matches.length;
            }
          }
        }
      }
    } catch (matchErr) {
      console.error("[sync-points] Match sync error:", matchErr);
    }

    // ── 3. Also save legacy points snapshot ──
    try {
      const snapshot = await fetchWkcoachPointsSnapshot({
        email,
        password,
        roundSequence,
      });
      if (snapshot) {
        const pointsSnapshot: PlayerPointsSnapshot = {
          roundSequence: snapshot.roundSequence ?? roundSequence,
          players: snapshot.players.map((p) => ({
            fantasyplayerId: p.fantasyplayerId,
            playerName: p.playerName,
            roundPoints: p.roundPoints,
            totalPoints: p.totalPoints,
            teamName: p.teamName,
            teamCode: p.teamCode,
            position: p.position,
            syncedAt,
          })),
          syncedAt,
        };
        await savePlayerPoints("wk", pointsSnapshot);
      }
    } catch {
      // Non-critical: legacy store is optional
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

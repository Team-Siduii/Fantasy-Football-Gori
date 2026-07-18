import { NextResponse } from "next/server";
import { getWkMatches } from "@/lib/wk-sync-store";
import { normalizeWkCompetitionRound } from "../../../../lib/wk-rounds";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roundParam = url.searchParams.get("round");
    const round = roundParam ? Number(roundParam) : undefined;

    const rawMatches = await getWkMatches();
    const matches = typeof round === "number" && Number.isInteger(round) && round > 0
      ? rawMatches.filter((match) => normalizeWkCompetitionRound(match.round) === round)
      : rawMatches;

    return NextResponse.json({
      count: matches.length,
      matches: matches.map((m) => ({
        matchId: m.match_id,
        round: normalizeWkCompetitionRound(m.round),
        homeTeam: m.home_team,
        awayTeam: m.away_team,
        homeTeamCode: m.home_team_code,
        awayTeamCode: m.away_team_code,
        homeScore: m.home_score,
        awayScore: m.away_score,
        status: m.status,
        minute: m.minute,
        kickoffAt: m.kickoff_at,
      })),
      source: "db",
      lastSyncedAt: matches[0]?.synced_at ?? null,
    }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[wk/matches] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to read WK matches",
        count: 0,
        matches: [],
        source: "db",
        syncStatus: "unavailable — database read failed",
        lastSyncedAt: null,
      },
      { headers: NO_CACHE_HEADERS },
    );
  }
}

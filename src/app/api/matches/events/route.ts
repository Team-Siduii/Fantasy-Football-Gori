import { NextResponse } from "next/server";
import { mapOpenLigaDbMatchesToNormalized, type OpenLigaDbMatch } from "@/lib/data-sources/openligadb";
import { mergeNormalizedMatches } from "@/lib/data-sources/match-events-merge";
import { mapTheSportsDbEventsToNormalized, type TheSportsDbEvent } from "@/lib/data-sources/thesportsdb";
import { enrichMatchesWithWkcoachPoints, fetchWkcoachPointsSnapshot } from "@/lib/data-sources/wkcoach";
import { getPlayerPointsPriority, shouldUseWkcoachByDefault } from "@/lib/data-sources/wkcoach-policy";

async function fetchOpenLigaDb(leagueShortcut: string, season: number): Promise<OpenLigaDbMatch[]> {
  const url = `https://api.openligadb.de/getmatchdata/${leagueShortcut}/${season}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return [];
  return (await response.json()) as OpenLigaDbMatch[];
}

async function fetchTheSportsDb(leagueId: string, season: string): Promise<TheSportsDbEvent[]> {
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=${encodeURIComponent(leagueId)}&s=${encodeURIComponent(season)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return [];
  const json = (await response.json()) as { events?: TheSportsDbEvent[] | null };
  return json.events ?? [];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const leagueShortcut = url.searchParams.get("league") ?? "bl1";
  const season = Number(url.searchParams.get("season") ?? "2023");
  const sportsDbLeagueId = url.searchParams.get("sportsDbLeagueId") ?? "4328";
  const sportsDbSeason = url.searchParams.get("sportsDbSeason") ?? "2023-2024";

  const roundSequence = Number(url.searchParams.get("roundSeq") ?? "1");
  const includeWkcoach = shouldUseWkcoachByDefault(url.searchParams.get("includeWkcoach"));

  const openLigaMatches = mapOpenLigaDbMatchesToNormalized(await fetchOpenLigaDb(leagueShortcut, season));
  const sportsDbMatches = mapTheSportsDbEventsToNormalized(await fetchTheSportsDb(sportsDbLeagueId, sportsDbSeason));
  const merged = mergeNormalizedMatches(openLigaMatches, sportsDbMatches);

  let wkcoachEnabled = false;
  let wkcoachRoundSequence: number | null = null;
  let wkcoachPlayersCount = 0;
  let finalMatches = merged;

  if (includeWkcoach) {
    const email = process.env.WKCOACH_EMAIL;
    const password = process.env.WKCOACH_PASSWORD;

    if (email && password) {
      const snapshot = await fetchWkcoachPointsSnapshot({ email, password, roundSequence });
      if (snapshot) {
        finalMatches = enrichMatchesWithWkcoachPoints(merged, snapshot);
        wkcoachEnabled = true;
        wkcoachRoundSequence = snapshot.roundSequence;
        wkcoachPlayersCount = snapshot.players.length;
      }
    }
  }

  return NextResponse.json({
    count: finalMatches.length,
    sourcePriority: {
      score: "openligadb>thesportsdb",
      goals: "openligadb>thesportsdb",
      assists: "thesportsdb>openligadb",
      saves: "thesportsdb>openligadb",
      cards: "thesportsdb>openligadb",
      playerPoints: getPlayerPointsPriority(),
    },
    wkcoach: {
      requested: includeWkcoach,
      enabled: wkcoachEnabled,
      roundSequence: wkcoachRoundSequence,
      playersCount: wkcoachPlayersCount,
    },
    matches: finalMatches,
  });
}

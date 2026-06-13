import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { parsePlayerCsv } from "@/domain/player-csv";
import { bootstrapPlayersFromDefaultCsv } from "@/lib/player-bootstrap";
import { listPlayers } from "@/lib/player-store";
import { getWkPlayerPoints, getWkPlayerEvents, applyDefenderCleanSheetBonus } from "@/lib/wk-sync-store";
import { getLeagueAdminConfigPersistent } from "@/lib/league-admin-config";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = (url.searchParams.get("mode") ?? "eredivisie").toLowerCase();

  if (mode === "wk") {
    // Lees statische CSV voor basis spelersdata (naam, club, positie, prijs)
    const wkCsvPath = path.join(process.cwd(), "data", "players-wk.csv");
    let csvPlayers: ReturnType<typeof parsePlayerCsv>["players"] = [];

    try {
      const csvContent = await readFile(wkCsvPath, "utf-8");
      const parsed = parsePlayerCsv(csvContent);
      csvPlayers = parsed.players;
    } catch {
      return NextResponse.json({ count: 0, players: [] }, { headers: NO_CACHE_HEADERS });
    }

    // Haal punten en events uit onze eigen WK database
    const dbPlayers = await getWkPlayerPoints(1); // round 1 voor nu
    const dbEvents = await getWkPlayerEvents(1);

    // Haal league config voor prijsaanpassing
    let priceOffset = 0;
    try {
      const leagueConfig = await getLeagueAdminConfigPersistent("wk");
      priceOffset = leagueConfig.budget.priceOffsetMillions ?? 0;
    } catch {
      // use default 0
    }

    // Indexeer DB data op fantasyplayer_id
    const dbById = new Map<number, typeof dbPlayers[0]>();
    const eventsById = new Map<number, typeof dbEvents>();

    for (const p of dbPlayers) {
      dbById.set(p.fantasyplayer_id, p);
    }
    for (const ev of dbEvents) {
      const arr = eventsById.get(ev.fantasyplayer_id) || [];
      arr.push(ev);
      eventsById.set(ev.fantasyplayer_id, arr);
    }

    // Merge CSV data met DB punten
    const playersWithPoints = csvPlayers.map((csv) => {
      const playerId = parseInt(csv.id, 10);
      const db = dbById.get(playerId);

      // Bouw point events uit DB
      const rawEvents = (eventsById.get(playerId) || []).map(ev => ({
        eventCode: ev.event_code,
        points: ev.points,
        minute: ev.minute,
      }));

      // Bereken basis punten
      const baseRoundPoints = db?.round_points ?? 0;
      const baseTotalPoints = db?.total_points ?? 0;

      // Pas CS bonus toe voor verdedigers
      const position = db?.position ?? "";
      const positionNl = db?.position_nl ?? "";
      const adjusted = applyDefenderCleanSheetBonus(
        { roundPoints: baseRoundPoints, totalPoints: baseTotalPoints, pointEvents: rawEvents },
        position,
        positionNl,
      );

      // Pas prijsaanpassing toe uit league config
      const adjustedPrice = Math.max(0, csv.prijs - priceOffset);

      return {
        ...csv,
        prijs: adjustedPrice,
        punten: adjusted.totalPoints ?? 0,
        totalPoints: adjusted.totalPoints ?? 0,
        pointEvents: adjusted.pointEvents ?? [],
      };
    });

    return NextResponse.json({
      count: playersWithPoints.length,
      players: playersWithPoints,
    }, { headers: NO_CACHE_HEADERS });
  }

  await bootstrapPlayersFromDefaultCsv();

  return NextResponse.json({
    count: listPlayers().length,
    players: listPlayers(),
  }, { headers: NO_CACHE_HEADERS });
}

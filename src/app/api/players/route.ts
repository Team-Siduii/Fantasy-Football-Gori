import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { parsePlayerCsv } from "@/domain/player-csv";
import { bootstrapPlayersFromDefaultCsv } from "@/lib/player-bootstrap";
import { listPlayers } from "@/lib/player-store";
import { getWkPlayerPoints, getWkPlayerEvents, applyDefenderCleanSheetBonus } from "@/lib/wk-sync-store";

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

    // Indexeer DB data op naam (genormaliseerd)
    const dbByName = new Map<string, typeof dbPlayers[0]>();
    const eventsByName = new Map<string, typeof dbEvents>();

    for (const p of dbPlayers) {
      const key = normalizeName(p.name);
      dbByName.set(key, p);
    }
    for (const ev of dbEvents) {
      // Koppel events via fantasyplayer_id
      const player = dbPlayers.find(p => p.fantasyplayer_id === ev.fantasyplayer_id);
      if (player) {
        const key = normalizeName(player.name);
        const arr = eventsByName.get(key) || [];
        arr.push(ev);
        eventsByName.set(key, arr);
      }
    }

    // Merge CSV data met DB punten
    const playersWithPoints = csvPlayers.map((csv) => {
      const key = normalizeName(csv.naam);
      const db = dbByName.get(key);

      // Bouw point events uit DB
      const rawEvents = (eventsByName.get(key) || []).map(ev => ({
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

      return {
        ...csv,
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

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { parsePlayerCsv } from "@/domain/player-csv";
import { bootstrapPlayersFromDefaultCsv } from "@/lib/player-bootstrap";
import { listPlayers } from "@/lib/player-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = (url.searchParams.get("mode") ?? "eredivisie").toLowerCase();

  const headers: Record<string, string> = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  if (mode === "wk") {
    const wkCsvPath = path.join(process.cwd(), "data", "players-wk.csv");

    try {
      const csvContent = await readFile(wkCsvPath, "utf-8");
      const { players } = parsePlayerCsv(csvContent);

      return NextResponse.json({ count: players.length, players }, { headers });
    } catch {
      return NextResponse.json({ count: 0, players: [] }, { headers });
    }
  }

  await bootstrapPlayersFromDefaultCsv();

  return NextResponse.json({
    count: listPlayers().length,
    players: listPlayers(),
  }, { headers });
}

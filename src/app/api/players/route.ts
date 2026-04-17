import { NextResponse } from "next/server";
import { bootstrapPlayersFromDefaultCsv } from "@/lib/player-bootstrap";
import { listPlayers } from "@/lib/player-store";

export async function GET() {
  await bootstrapPlayersFromDefaultCsv();

  return NextResponse.json({
    count: listPlayers().length,
    players: listPlayers(),
  });
}

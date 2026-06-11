import { NextResponse } from "next/server";
import { loadPlayerPoints } from "@/lib/player-points-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = (url.searchParams.get("scope") ?? "wk") as "eredivisie" | "wk";

  const snapshot = await loadPlayerPoints(scope);

  if (!snapshot) {
    return NextResponse.json({
      roundSequence: null,
      players: [],
      syncedAt: null,
      lastSync: null,
    });
  }

  return NextResponse.json({
    roundSequence: snapshot.roundSequence,
    players: snapshot.players,
    syncedAt: snapshot.syncedAt,
    lastSync: snapshot.syncedAt,
  });
}

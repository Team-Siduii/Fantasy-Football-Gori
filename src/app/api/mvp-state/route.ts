import { NextResponse } from "next/server";
import { buildMvpSnapshot } from "@/domain/mvp-snapshot";
import { mockLeagueConfig } from "@/lib/mock-league";

export async function GET() {
  const snapshot = buildMvpSnapshot(mockLeagueConfig, new Date());

  return NextResponse.json({
    appVersion: "mvp-v0.1",
    snapshot,
  });
}

import { NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { buildLeagueRankingSnapshot } from "@/lib/league-ranking";
import type { ManagerStateScope } from "@/lib/manager-state";

export async function GET(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope: ManagerStateScope = url.searchParams.get("mode") === "wk" ? "wk" : "eredivisie";
  const snapshot = await buildLeagueRankingSnapshot(scope, email);

  return NextResponse.json(snapshot);
}

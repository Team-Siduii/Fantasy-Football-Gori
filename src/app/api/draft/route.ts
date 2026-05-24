import { NextResponse } from "next/server";
import { isAuthenticatedSession } from "@/lib/auth-session";
import { readDraftState, registerPick, returnPickedPlayerToPool, startDraft } from "@/lib/draft-state";

export async function GET() {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  return NextResponse.json({ draft: readDraftState() });
}

export async function POST(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  let body: {
    action?: "start" | "pick" | "return";
    leagueId?: string;
    teamOrder?: string[];
    totalRounds?: number;
    startedBy?: string;
    teamId?: string;
    playerId?: string;
    reason?: string;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ongeldige request body" }, { status: 400 });
  }

  try {
    if (body.action === "start") {
      if (!body.leagueId || !Array.isArray(body.teamOrder) || typeof body.totalRounds !== "number" || !body.startedBy) {
        return NextResponse.json({ error: "Ontbrekende draft-start velden" }, { status: 400 });
      }
      const draft = startDraft({
        leagueId: body.leagueId,
        teamOrder: body.teamOrder,
        totalRounds: body.totalRounds,
        startedBy: body.startedBy,
      });
      return NextResponse.json({ ok: true, draft });
    }

    if (body.action === "pick") {
      if (!body.teamId || !body.playerId) {
        return NextResponse.json({ error: "teamId en playerId zijn verplicht" }, { status: 400 });
      }
      const draft = registerPick({ teamId: body.teamId, playerId: body.playerId });
      return NextResponse.json({ ok: true, draft });
    }

    if (body.action === "return") {
      if (!body.teamId || !body.playerId || !body.reason) {
        return NextResponse.json({ error: "teamId, playerId en reason zijn verplicht" }, { status: 400 });
      }
      const draft = returnPickedPlayerToPool({
        teamId: body.teamId,
        playerId: body.playerId,
        reason: body.reason,
      });
      return NextResponse.json({ ok: true, draft });
    }

    return NextResponse.json({ error: "Onbekende action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { isAuthenticatedSession } from "@/lib/auth-session";
import { getIntegrityReport, repairIntegrityIssues } from "@/lib/gori-state-integrity";
import { hasLeaguePermission, resolveActorIdFromRequest } from "@/lib/rbac";

function resolveModeFromRequest(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode") ?? "eredivisie";
  return mode === "wk" ? "wk" : "eredivisie";
}

export async function GET(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const actorId = resolveActorIdFromRequest(request);
  if (!hasLeaguePermission(actorId, "MANAGE_RULES")) {
    return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
  }

  const mode = resolveModeFromRequest(request);
  return NextResponse.json({ mode, report: await getIntegrityReport(mode) });
}

export async function POST(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const actorId = resolveActorIdFromRequest(request);
  if (!hasLeaguePermission(actorId, "MANAGE_RULES")) {
    return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
  }

  const mode = resolveModeFromRequest(request);
  const result = await repairIntegrityIssues(mode);
  return NextResponse.json({ ok: true, mode, result, report: await getIntegrityReport(mode) });
}

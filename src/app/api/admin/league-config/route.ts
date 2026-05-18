import { NextResponse } from "next/server";
import { isAuthenticatedSession } from "@/lib/auth-session";
import { getLeagueAdminConfig, updateLeagueAdminConfig } from "@/lib/league-admin-config";
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
  return NextResponse.json({ config: getLeagueAdminConfig(mode), mode });
}

export async function PUT(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const actorId = resolveActorIdFromRequest(request);
  if (!hasLeaguePermission(actorId, "MANAGE_RULES")) {
    return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const mode = resolveModeFromRequest(request);
  const next = updateLeagueAdminConfig(body, mode);
  return NextResponse.json({ ok: true, config: next, mode });
}

import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { parsePlayerCsv } from "@/domain/player-csv";
import { getAuthenticatedEmail, isAuthenticatedSession } from "@/lib/auth-session";
import { resolveDraftTeamManagerEmail } from "@/lib/draft-manager-sync";
import {
  readDraftStatePersistent,
  registerPickPersistent,
  returnPickedPlayerToPoolPersistent,
  startDraftPersistent,
} from "@/lib/draft-state";
import { getLeagueAdminConfigPersistent } from "@/lib/league-admin-config";
import { bootstrapPlayersFromDefaultCsv } from "@/lib/player-bootstrap";
import { listPlayers } from "@/lib/player-store";
import { readTeamRosterStatePersistent } from "@/lib/team-roster-state";

function resolveDraftScope(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("mode") === "wk" ? "wk" : "eredivisie";
}

async function loadDraftPlayerCatalog(scope: "eredivisie" | "wk") {
  if (scope === "wk") {
    try {
      const csvContent = await readFile(path.join(process.cwd(), "data", "players-wk.csv"), "utf-8");
      return parsePlayerCsv(csvContent).players;
    } catch {
      return [];
    }
  }

  await bootstrapPlayersFromDefaultCsv();
  return listPlayers();
}

export async function GET(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const scope = resolveDraftScope(request);
  const [draft, teamRosterState] = await Promise.all([readDraftStatePersistent(scope), readTeamRosterStatePersistent(scope)]);

  return NextResponse.json({ draft, teamRosters: teamRosterState.byTeamId });
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
    const scope = resolveDraftScope(request);

    if (body.action === "start") {
      if (!body.leagueId || !Array.isArray(body.teamOrder) || typeof body.totalRounds !== "number" || !body.startedBy) {
        return NextResponse.json({ error: "Ontbrekende draft-start velden" }, { status: 400 });
      }
      const draft = await startDraftPersistent({
        leagueId: body.leagueId,
        teamOrder: body.teamOrder,
        totalRounds: body.totalRounds,
        startedBy: body.startedBy,
        scope,
      });
      return NextResponse.json({ ok: true, draft, teamRosters: (await readTeamRosterStatePersistent(scope)).byTeamId });
    }

    if (body.action === "pick") {
      if (!body.teamId || !body.playerId) {
        return NextResponse.json({ error: "teamId en playerId zijn verplicht" }, { status: 400 });
      }
      const config = await getLeagueAdminConfigPersistent(scope);
      if (config.draft.mode === "manager") {
        const email = await getAuthenticatedEmail();
        if (!email) {
          return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
        }
        const teamManagerEmail = resolveDraftTeamManagerEmail(body.teamId, scope);
        if (!teamManagerEmail || teamManagerEmail !== email) {
          return NextResponse.json({ error: "Je kunt alleen spelers kiezen voor je eigen team" }, { status: 403 });
        }
      }
      const draft = await registerPickPersistent({
        teamId: body.teamId,
        playerId: body.playerId,
        scope,
        playerCatalog: await loadDraftPlayerCatalog(scope),
        budgetCap: config.budget.teamValueCapMillions,
      });
      return NextResponse.json({ ok: true, draft, teamRosters: (await readTeamRosterStatePersistent(scope)).byTeamId });
    }

    if (body.action === "return") {
      if (!body.teamId || !body.playerId || !body.reason) {
        return NextResponse.json({ error: "teamId, playerId en reason zijn verplicht" }, { status: 400 });
      }
      const draft = await returnPickedPlayerToPoolPersistent({
        teamId: body.teamId,
        playerId: body.playerId,
        reason: body.reason,
        scope,
      });
      return NextResponse.json({ ok: true, draft, teamRosters: (await readTeamRosterStatePersistent(scope)).byTeamId });
    }

    return NextResponse.json({ error: "Onbekende action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

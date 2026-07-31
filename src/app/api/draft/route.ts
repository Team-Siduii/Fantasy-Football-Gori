import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { parsePlayerCsv } from "@/domain/player-csv";
import { getAuthenticatedEmail, isAuthenticatedSession } from "@/lib/auth-session";
import { isAdminEmail } from "@/lib/auth-store";
import { resolveDraftTeamManagerEmailPersistent } from "@/lib/draft-manager-sync";
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
import { applyWkTransferPriceOffsetMillions } from "@/lib/wk-price";

function resolveDraftScope(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("mode") === "wk" ? "wk" : "eredivisie";
}

async function loadDraftPlayerCatalog(scope: "eredivisie" | "wk") {
  if (scope === "wk") {
    try {
      const csvContent = await readFile(path.join(process.cwd(), "data", "players-wk.csv"), "utf-8");
      return parsePlayerCsv(csvContent).players.map((player) => ({
        ...player,
        prijs: applyWkTransferPriceOffsetMillions(player.prijs),
      }));
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

  return NextResponse.json(
    { draft, teamRosters: teamRosterState.byTeamId },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    },
  );
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
    orderType?: "snake" | "linear";
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
      const email = await getAuthenticatedEmail();
      if (!email || !isAdminEmail(email)) {
        return NextResponse.json({ error: "Alleen admins kunnen een draft starten" }, { status: 403 });
      }
      const draft = await startDraftPersistent({
        leagueId: body.leagueId,
        teamOrder: body.teamOrder,
        totalRounds: body.totalRounds,
        orderType: body.orderType,
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
      const email = await getAuthenticatedEmail();
      if (!email) {
        return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
      }
      if (config.draft.mode === "manager") {
        const teamManagerEmail = await resolveDraftTeamManagerEmailPersistent(body.teamId, scope);
        if (!teamManagerEmail || teamManagerEmail !== email) {
          return NextResponse.json({ error: "Je kunt alleen spelers kiezen voor je eigen team" }, { status: 403 });
        }
      } else {
        // Admin mode: only admin users can draft
        if (!isAdminEmail(email)) {
          return NextResponse.json({ error: "Alleen admins kunnen draften in deze modus" }, { status: 403 });
        }
      }
      try {
        const draft = await registerPickPersistent({
          teamId: body.teamId,
          playerId: body.playerId,
          scope,
          playerCatalog: await loadDraftPlayerCatalog(scope),
          budgetCap: config.budget.teamValueCapMillions,
        });
        return NextResponse.json({ ok: true, draft, teamRosters: (await readTeamRosterStatePersistent(scope)).byTeamId });
      } catch (pickError) {
        const msg = pickError instanceof Error ? pickError.message : "Onbekende fout";
        // Verrijk "Speler is al in een ander team: X" met teamnaam
        const match = msg.match(/^Speler is al in een ander team: (.+)$/);
        if (match) {
          const otherTeamId = match[1];
          const participant = config.participants.find(
            (p) => p.label === otherTeamId || p.managerId === otherTeamId,
          );
          const teamName = participant?.label ?? otherTeamId;
          return NextResponse.json(
            { error: `Speler zit al in het team van ${teamName}` },
            { status: 409 },
          );
        }
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    if (body.action === "return") {
      if (!body.teamId || !body.playerId || !body.reason) {
        return NextResponse.json({ error: "teamId, playerId en reason zijn verplicht" }, { status: 400 });
      }
      const email = await getAuthenticatedEmail();
      if (!email || !isAdminEmail(email)) {
        return NextResponse.json({ error: "Alleen admins kunnen spelers terugzetten" }, { status: 403 });
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

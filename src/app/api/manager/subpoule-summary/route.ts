import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { parsePlayerCsv } from "@/domain/player-csv";
import { computeTeamSquadPoints } from "@/lib/player-derived";
import { loadPlayerPoints } from "@/lib/player-points-store";
import { getWkPlayerPoints } from "@/lib/wk-sync-store";
import { AUTH_TEST_ACCOUNT_PRESETS } from "@/lib/auth-test-accounts";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { ensureAuthStateFromDb, getProfileByEmail } from "@/lib/auth-store";
import { getLeagueAdminConfigPersistent } from "@/lib/league-admin-config";
import { readManagerStatePersistent, type ManagerStateScope } from "@/lib/manager-state";
import { bootstrapPlayersFromDefaultCsv } from "@/lib/player-bootstrap";
import { listPlayers } from "@/lib/player-store";
import { computeSubpouleStanding } from "@/lib/subpoule-ranking";

const SUBPOULE_BY_EMAIL: Record<string, string> = {
  "s.j.m.duindam@gmail.com": "A",
  "johan201@hotmail.com": "A",
  "thomasbart91@gmail.com": "A",
  "jackvandereep@hotmail.com": "A",
  "emielzomerdijk@gmail.com": "A",
  "ice.eckmund@gmail.com": "A",
};

function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

async function loadPlayers(scope: ManagerStateScope) {
  if (scope === "wk") {
    const wkCsvPath = path.join(process.cwd(), "data", "players-wk.csv");
    try {
      const csvContent = await readFile(wkCsvPath, "utf-8");
      return parsePlayerCsv(csvContent).players;
    } catch {
      return [];
    }
  }

  await bootstrapPlayersFromDefaultCsv();
  return listPlayers();
}

export async function GET(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAuthStateFromDb();

  const modeParam = new URL(request.url).searchParams.get("mode");
  const scope: ManagerStateScope = modeParam === "wk" ? "wk" : "eredivisie";
  const players = await loadPlayers(scope);

  // Laad cumulatieve spelerpunten direct op fantasyplayer_id
  const pointsById = new Map<string, number>();
  if (scope === "wk") {
    const dbPlayers = await getWkPlayerPoints(); // latest round per speler
    for (const p of dbPlayers) {
      pointsById.set(String(p.fantasyplayer_id), p.total_points);
    }
  } else {
    const pointsSnapshot = await loadPlayerPoints(scope);
    if (pointsSnapshot) {
      for (const pp of pointsSnapshot.players) {
        if (pp.fantasyplayerId) {
          pointsById.set(String(pp.fantasyplayerId), pp.totalPoints);
        }
      }
    }
    // Fallback: naam-gebaseerde lookup voor Eredivisie (geen fantasyplayer_id in CSV)
    if (pointsById.size === 0 && pointsSnapshot) {
      const players = await loadPlayers(scope);
      const nameMap = new Map<string, number>();
      for (const pp of pointsSnapshot.players) {
        nameMap.set(normalizePlayerName(pp.playerName), pp.totalPoints);
      }
      for (const player of players) {
        const pts = nameMap.get(normalizePlayerName(player.naam)) ?? 0;
        if (pts > 0) pointsById.set(player.id, pts);
      }
    }
  }

  const managerEntries = await Promise.all(
    AUTH_TEST_ACCOUNT_PRESETS.filter((preset) => Boolean(SUBPOULE_BY_EMAIL[preset.email.trim().toLowerCase()])).map(
      async (preset) => {
        const managerEmail = preset.email.trim().toLowerCase();
        const state = await readManagerStatePersistent(scope, managerEmail);
        const points = computeTeamSquadPoints(state.lineupIds, state.benchIds, pointsById);

        return {
          email: managerEmail,
          displayName: preset.name,
          subpoule: SUBPOULE_BY_EMAIL[managerEmail] ?? "A",
          points,
        };
      },
    ),
  );

  const standing = computeSubpouleStanding({
    managerEmail: email,
    managers: managerEntries,
  });

  const profile = getProfileByEmail(email);
  const leagueConfig = await getLeagueAdminConfigPersistent(scope);

  return NextResponse.json({
    mode: scope,
    teamName: profile?.teamName ?? "Mijn Super Team",
    leagueName: leagueConfig.competition.name,
    standing,
  });
}

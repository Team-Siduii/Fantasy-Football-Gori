import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { parsePlayerCsv } from "@/domain/player-csv";
import { computeTeamSquadPoints } from "@/lib/player-derived";
import { loadPlayerPoints } from "@/lib/player-points-store";
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

  // Laad cumulatieve spelerpunten uit de store (totalPoints)
  const pointsSnapshot = await loadPlayerPoints(scope);
  const playerPointsMap = new Map<string, number>();
  if (pointsSnapshot) {
    for (const pp of pointsSnapshot.players) {
      playerPointsMap.set(normalizePlayerName(pp.playerName), pp.totalPoints);
    }
  }

  // Map speler-ID → cumulatieve punten
  const pointsById = new Map<string, number>();
  for (const player of players) {
    pointsById.set(player.id, playerPointsMap.get(normalizePlayerName(player.naam)) ?? 0);
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

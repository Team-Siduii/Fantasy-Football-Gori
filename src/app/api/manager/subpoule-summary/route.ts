import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { parsePlayerCsv } from "@/domain/player-csv";
import { derivePlayerPoints } from "@/lib/player-derived";
import { AUTH_TEST_ACCOUNT_PRESETS } from "@/lib/auth-test-accounts";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { getProfileByEmail } from "@/lib/auth-store";
import { readManagerState, type ManagerStateScope } from "@/lib/manager-state";
import { bootstrapPlayersFromDefaultCsv } from "@/lib/player-bootstrap";
import { listPlayers } from "@/lib/player-store";
import { computeSubpouleStanding } from "@/lib/subpoule-ranking";

const SUBPOULE_BY_EMAIL: Record<string, string> = {
  "s.j.m.duindam@gmail.com": "A",
  "johan201@hotmail.com": "A",
  "thomasbart91@gmail.com": "A",
  "jackvandereep@hotmail.com": "A",
  "emielzomerdijk@gmail.com": "A",
};

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

  const modeParam = new URL(request.url).searchParams.get("mode");
  const scope: ManagerStateScope = modeParam === "wk" ? "wk" : "eredivisie";
  const players = await loadPlayers(scope);
  const pointsById = new Map(players.map((player) => [player.id, derivePlayerPoints(player)]));

  const managerEntries = AUTH_TEST_ACCOUNT_PRESETS.filter(
    (preset) => Boolean(SUBPOULE_BY_EMAIL[preset.email.trim().toLowerCase()]),
  ).map((preset) => {
    const managerEmail = preset.email.trim().toLowerCase();
    const state = readManagerState(scope, managerEmail);
    const points = [...state.lineupIds, ...state.benchIds].reduce((sum, playerId) => sum + (pointsById.get(playerId) ?? 0), 0);

    return {
      email: managerEmail,
      displayName: preset.name,
      subpoule: SUBPOULE_BY_EMAIL[managerEmail] ?? "A",
      points,
    };
  });

  const standing = computeSubpouleStanding({
    managerEmail: email,
    managers: managerEntries,
  });

  const profile = getProfileByEmail(email);

  return NextResponse.json({
    mode: scope,
    teamName: profile?.teamName ?? "Mijn Super Team",
    standing,
  });
}

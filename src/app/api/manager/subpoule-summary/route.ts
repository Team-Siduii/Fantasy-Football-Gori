import { NextResponse } from "next/server";
import { AUTH_TEST_ACCOUNT_PRESETS } from "@/lib/auth-test-accounts";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { ensureAuthStateFromDb, getProfileByEmail } from "@/lib/auth-store";
import { getLeagueAdminConfigPersistent } from "@/lib/league-admin-config";
import type { ManagerStateScope } from "@/lib/manager-state";
import { computeSubpouleStanding } from "@/lib/subpoule-ranking";
import { summarizeManagerTeamScoresPersistent } from "@/lib/team-score-state";

const SUBPOULE_BY_EMAIL: Record<string, string> = {
  "s.j.m.duindam@gmail.com": "A",
  "johan201@hotmail.com": "A",
  "thomasbart91@gmail.com": "A",
  "jackvandereep@hotmail.com": "A",
  "emielzomerdijk@gmail.com": "A",
  "ice.eckmund@gmail.com": "A",
};

export async function GET(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAuthStateFromDb();

  const modeParam = new URL(request.url).searchParams.get("mode");
  const scope: ManagerStateScope = modeParam === "wk" ? "wk" : "eredivisie";

  const managerEntries = await Promise.all(
    AUTH_TEST_ACCOUNT_PRESETS.filter((preset) => Boolean(SUBPOULE_BY_EMAIL[preset.email.trim().toLowerCase()])).map(
      async (preset) => {
        const managerEmail = preset.email.trim().toLowerCase();
        const scoreSummary = scope === "wk"
          ? await summarizeManagerTeamScoresPersistent(scope, managerEmail)
          : { totalPoints: 0 };

        return {
          email: managerEmail,
          displayName: preset.name,
          subpoule: SUBPOULE_BY_EMAIL[managerEmail] ?? "A",
          points: scoreSummary.totalPoints,
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

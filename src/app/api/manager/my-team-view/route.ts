import { NextResponse } from "next/server";

import { ensureAuthStateFromDb, getProfileByEmail } from "@/lib/auth-store";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { repairManagerTeamFromDraftArtifactsPersistent } from "@/lib/draft-manager-sync";
import { buildManagerTeamViewPersistent } from "@/lib/manager-team-view";
import { type ManagerStateScope } from "@/lib/manager-state";

export async function GET(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAuthStateFromDb();

  const url = new URL(request.url);
  const scope: ManagerStateScope = url.searchParams.get("mode") === "wk" ? "wk" : "eredivisie";
  const roundNumber = Number(url.searchParams.get("roundNumber") ?? "");

  await repairManagerTeamFromDraftArtifactsPersistent({ managerEmail: email, scope });

  const profile = getProfileByEmail(email);
  const teamView = await buildManagerTeamViewPersistent({
    scope,
    managerEmail: email,
    roundNumber,
  });

  return NextResponse.json({
    isOwnTeam: true,
    teamName: profile?.teamName ?? "Onbekend team",
    managerName: profile?.name ?? email.split("@")[0],
    ...teamView,
  });
}

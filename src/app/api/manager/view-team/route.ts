import { NextResponse } from "next/server";

import { ensureAuthStateFromDb, getProfileByEmail } from "@/lib/auth-store";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { repairManagerTeamFromDraftArtifactsPersistent } from "@/lib/draft-manager-sync";
import { buildManagerTeamViewPersistent } from "@/lib/manager-team-view";
import { type ManagerStateScope } from "@/lib/manager-state";

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

  const url = new URL(request.url);
  const targetEmail = url.searchParams.get("email")?.trim().toLowerCase();
  if (!targetEmail) {
    return NextResponse.json({ error: "Geen email opgegeven" }, { status: 400 });
  }

  const userSubpoule = SUBPOULE_BY_EMAIL[email] ?? "A";
  const targetSubpoule = SUBPOULE_BY_EMAIL[targetEmail] ?? "A";
  if (userSubpoule !== targetSubpoule) {
    return NextResponse.json({ error: "Niet in dezelfde subpoule" }, { status: 403 });
  }

  await ensureAuthStateFromDb();

  const scope: ManagerStateScope = url.searchParams.get("mode") === "wk" ? "wk" : "eredivisie";
  const roundNumber = Number(url.searchParams.get("roundNumber") ?? "");
  const isOwnTeam = email === targetEmail;

  await repairManagerTeamFromDraftArtifactsPersistent({ managerEmail: targetEmail, scope });

  const teamView = await buildManagerTeamViewPersistent({
    scope,
    managerEmail: targetEmail,
    roundNumber,
  });
  const profile = getProfileByEmail(targetEmail);

  return NextResponse.json({
    isOwnTeam,
    teamName: profile?.teamName ?? "Onbekend team",
    managerName: profile?.name ?? targetEmail.split("@")[0],
    roundNumber: teamView.roundNumber,
    formation: teamView.formation,
    lineup: teamView.lineup,
    bench: teamView.bench.map((player) => ({
      ...player,
      punten: Math.ceil(player.punten / 2),
    })),
    budgetCap: teamView.budgetCap,
    budgetRemaining: teamView.budgetRemaining,
    squadCost: teamView.squadCost,
    pendingSellId: isOwnTeam ? teamView.pendingSellId : null,
    pendingBuyId: isOwnTeam ? teamView.pendingBuyId : null,
    teamTotalPoints: teamView.teamTotalPoints,
    teamCurrentRoundPoints: teamView.teamCurrentRoundPoints,
    scoreSource: teamView.scoreSource,
  });
}

import { NextResponse } from "next/server";
import { completeInitialSetup, getProfileByEmail } from "@/lib/auth-store";
import { getAuthenticatedEmail } from "@/lib/auth-session";

export async function POST(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = (await request.json()) as { inviteCode?: string; newPassword?: string; teamName?: string };
  if (!body.inviteCode || !body.newPassword || !body.teamName) {
    return NextResponse.json({ error: "Inlogcode, nieuw wachtwoord en teamnaam zijn verplicht." }, { status: 400 });
  }

  if (body.newPassword.length < 8) {
    return NextResponse.json({ error: "Nieuw wachtwoord moet minimaal 8 tekens hebben." }, { status: 400 });
  }

  const ok = completeInitialSetup(email, body.inviteCode, body.newPassword, body.teamName);
  if (!ok) {
    return NextResponse.json({ error: "Setup mislukt. Controleer je inlogcode." }, { status: 400 });
  }

  const profile = getProfileByEmail(email);
  return NextResponse.json({ ok: true, profile });
}

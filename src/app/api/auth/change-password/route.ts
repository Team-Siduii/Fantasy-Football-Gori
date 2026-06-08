import { NextResponse } from "next/server";
import { changePassword, ensureAuthStateFromDb, flushAuthStateToDb } from "@/lib/auth-store";
import { getAuthenticatedEmail } from "@/lib/auth-session";

export async function POST(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = (await request.json()) as { currentPassword?: string; newPassword?: string };
  if (!body.currentPassword || !body.newPassword) {
    return NextResponse.json({ error: "Huidig en nieuw wachtwoord zijn verplicht." }, { status: 400 });
  }

  if (body.newPassword.length < 8) {
    return NextResponse.json({ error: "Nieuw wachtwoord moet minimaal 8 tekens hebben." }, { status: 400 });
  }

  await ensureAuthStateFromDb();
  const ok = changePassword(email, body.currentPassword, body.newPassword);
  await flushAuthStateToDb();

  if (!ok) {
    return NextResponse.json({ error: "Huidig wachtwoord is onjuist." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

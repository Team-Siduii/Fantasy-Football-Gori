import { NextResponse } from "next/server";
import { ensureAuthStateFromDb, flushAuthStateToDb, getProfileByEmail, isAdminEmail, updateProfileByEmail } from "@/lib/auth-store";
import { getAuthenticatedEmail } from "@/lib/auth-session";

export async function GET() {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  await ensureAuthStateFromDb();
  const profile = getProfileByEmail(email);
  if (!profile) {
    return NextResponse.json({ error: "Account niet gevonden" }, { status: 404 });
  }

  return NextResponse.json({ profile, role: isAdminEmail(email) ? "admin" : "manager" });
}

export async function PUT(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = (await request.json()) as { name?: string; teamName?: string };

  if (!body.name || !body.teamName) {
    return NextResponse.json({ error: "Naam en teamnaam zijn verplicht." }, { status: 400 });
  }

  await ensureAuthStateFromDb();
  const profile = updateProfileByEmail(email, {
    name: body.name.trim(),
    teamName: body.teamName.trim(),
  });
  await flushAuthStateToDb();

  if (!profile) {
    return NextResponse.json({ error: "Account niet gevonden" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, profile });
}

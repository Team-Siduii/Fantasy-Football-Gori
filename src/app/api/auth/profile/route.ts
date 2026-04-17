import { NextResponse } from "next/server";
import { getManagerProfile, updateManagerProfile } from "@/lib/auth-store";
import { isAuthenticatedSession } from "@/lib/auth-session";

export async function GET() {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  return NextResponse.json({ profile: getManagerProfile() });
}

export async function PUT(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = (await request.json()) as { name?: string; teamName?: string };

  if (!body.name || !body.teamName) {
    return NextResponse.json({ error: "Naam en teamnaam zijn verplicht." }, { status: 400 });
  }

  const profile = updateManagerProfile({
    name: body.name.trim(),
    teamName: body.teamName.trim(),
  });

  return NextResponse.json({ ok: true, profile });
}

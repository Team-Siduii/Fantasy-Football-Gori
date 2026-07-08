import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth-store";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { resolveGoriDatabaseDebugInfo } from "@/lib/persistent-json-store";

export async function GET() {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
  }

  return NextResponse.json({
    database: resolveGoriDatabaseDebugInfo(),
  });
}

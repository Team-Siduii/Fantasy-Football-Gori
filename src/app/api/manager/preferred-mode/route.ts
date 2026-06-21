import { NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { resolvePreferredManagerRoute } from "@/lib/manager-entry-route";

export async function GET() {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const route = await resolvePreferredManagerRoute(email);
  const mode = route.startsWith("/manager/world-cup") ? "wk" : "eredivisie";

  return NextResponse.json({ mode, route });
}

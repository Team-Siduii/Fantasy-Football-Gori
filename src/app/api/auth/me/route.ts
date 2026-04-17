import { NextResponse } from "next/server";
import { getManagerProfile } from "@/lib/auth-store";
import { isAuthenticatedSession } from "@/lib/auth-session";

export async function GET() {
  const authenticated = await isAuthenticatedSession();

  if (!authenticated) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    profile: getManagerProfile(),
  });
}

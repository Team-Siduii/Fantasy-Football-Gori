import { NextResponse } from "next/server";
import { getProfileByEmail } from "@/lib/auth-store";
import { getAuthenticatedEmail } from "@/lib/auth-session";

export async function GET() {
  const email = await getAuthenticatedEmail();

  if (!email) {
    return NextResponse.json({ authenticated: false });
  }

  const profile = getProfileByEmail(email);
  if (!profile) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    profile,
  });
}

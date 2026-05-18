import { NextResponse } from "next/server";
import { authenticateManagerWithStatus } from "@/lib/auth-store";
import { AUTH_COOKIE_NAME, getSessionCookieValue } from "@/lib/auth-session";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string };

  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Email en wachtwoord/inlogcode zijn verplicht." }, { status: 400 });
  }

  const status = authenticateManagerWithStatus(body.email, body.password);
  if (!status.ok) {
    return NextResponse.json({ error: "Ongeldige login." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, requiresSetup: status.requiresSetup });
  response.cookies.set(AUTH_COOKIE_NAME, getSessionCookieValue(body.email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}

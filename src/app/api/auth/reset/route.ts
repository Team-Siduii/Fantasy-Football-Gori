import { NextResponse } from "next/server";
import { consumePasswordResetToken } from "@/lib/auth-store";

export async function POST(request: Request) {
  const body = (await request.json()) as { token?: string; newPassword?: string };

  if (!body.token || !body.newPassword) {
    return NextResponse.json({ error: "Token en nieuw wachtwoord zijn verplicht." }, { status: 400 });
  }

  if (body.newPassword.length < 8) {
    return NextResponse.json({ error: "Nieuw wachtwoord moet minimaal 8 tekens hebben." }, { status: 400 });
  }

  const updated = consumePasswordResetToken(body.token, body.newPassword);
  if (!updated) {
    return NextResponse.json({ error: "Ongeldige of verlopen reset token." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

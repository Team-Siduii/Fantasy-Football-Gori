import { NextResponse } from "next/server";
import { createPasswordResetToken } from "@/lib/auth-store";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string };

  if (!body.email) {
    return NextResponse.json({ error: "Email is verplicht." }, { status: 400 });
  }

  const token = createPasswordResetToken(body.email);

  return NextResponse.json({
    ok: true,
    message: "Als het account bestaat is een resetlink aangemaakt.",
    token,
  });
}

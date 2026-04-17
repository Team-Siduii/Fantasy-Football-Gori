import { NextResponse } from "next/server";
import { createPasswordResetToken, getManagerProfile, getPasswordResetLink } from "@/lib/auth-store";
import { sendPasswordResetEmail } from "@/lib/mailer";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string };

  if (!body.email) {
    return NextResponse.json({ error: "Email is verplicht." }, { status: 400 });
  }

  const token = createPasswordResetToken(body.email);
  const relativeLink = token ? getPasswordResetLink(token) : null;
  const origin = new URL(request.url).origin;
  const resetLink = relativeLink ? `${origin}${relativeLink}` : null;

  let mailDelivered = false;
  let mailReason: string | undefined;

  if (resetLink && token) {
    const profile = getManagerProfile();
    const mailResult = await sendPasswordResetEmail({
      toEmail: profile.email,
      toName: profile.name,
      resetLink,
    });

    mailDelivered = mailResult.delivered;
    mailReason = mailResult.reason;
  }

  return NextResponse.json({
    ok: true,
    message: "Als het account bestaat is een resetlink aangemaakt.",
    resetLink,
    mailDelivered,
    mailReason,
  });
}

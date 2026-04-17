import nodemailer from "nodemailer";

type MailResult = {
  delivered: boolean;
  messageId?: string;
  reason?: string;
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !portRaw || !user || !pass || !from) {
    return null;
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port)) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    from,
  };
}

export async function sendPasswordResetEmail(input: {
  toEmail: string;
  toName: string;
  resetLink: string;
}): Promise<MailResult> {
  const smtp = getSmtpConfig();

  if (!smtp) {
    return {
      delivered: false,
      reason: "SMTP niet geconfigureerd",
    };
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });

  const info = await transporter.sendMail({
    from: smtp.from,
    to: input.toEmail,
    subject: "Reset je Fantasy Eredivisie wachtwoord",
    text: `Hoi ${input.toName},\n\nGebruik deze link om je wachtwoord te resetten:\n${input.resetLink}\n\nDeze link verloopt over 30 minuten.`,
    html: `<p>Hoi ${input.toName},</p><p>Gebruik deze link om je wachtwoord te resetten:</p><p><a href="${input.resetLink}">${input.resetLink}</a></p><p>Deze link verloopt over 30 minuten.</p>`,
  });

  return {
    delivered: true,
    messageId: info.messageId,
  };
}

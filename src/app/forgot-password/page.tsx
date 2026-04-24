"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("manager@gori.local");
  const [resetLink, setResetLink] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setResetLink("");

    try {
      const response = await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = (await response.json()) as {
        error?: string;
        message?: string;
        resetLink?: string | null;
        mailDelivered?: boolean;
        mailReason?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "Reset aanvragen mislukt");
        return;
      }

      setMessage(data.message ?? "Reset aangevraagd.");
      if (data.mailDelivered === false && data.mailReason) {
        setMessage(`${data.message ?? "Reset aangevraagd."} (${data.mailReason}; toon testlink hieronder)`);
      }
      if (data.resetLink) {
        setResetLink(data.resetLink);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <h1>Wachtwoord resetten</h1>
        <p>Vul je testaccount-email in om een reset-token te genereren.</p>

        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>

          {error ? <p className="error-text">{error}</p> : null}
          {message ? <p className="success-text">{message}</p> : null}

          <button type="submit" disabled={loading}>
            {loading ? "Aanvragen..." : "Vraag reset aan"}
          </button>
        </form>

        {resetLink ? (
          <p className="token-box">
            Reset link (test-mail): <code>{resetLink}</code>
            <br />
            Open direct: <Link href={resetLink}>reset-pagina</Link>.
          </p>
        ) : null}

        <div className="auth-links">
          <Link href="/login">Terug naar login</Link>
        </div>
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function ResetPasswordForm({ initialToken }: { initialToken: string }) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Reset mislukt");
        return;
      }

      setMessage("Wachtwoord is aangepast. Je wordt doorgestuurd naar login...");
      setTimeout(() => {
        router.push("/login");
      }, 900);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <h1>Nieuw wachtwoord instellen</h1>

        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Reset token
            <input type="text" value={token} onChange={(event) => setToken(event.target.value)} required />
          </label>

          <label>
            Nieuw wachtwoord
            <input
              type="password"
              value={newPassword}
              minLength={8}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}
          {message ? <p className="success-text">{message}</p> : null}

          <button type="submit" disabled={loading}>
            {loading ? "Opslaan..." : "Sla nieuw wachtwoord op"}
          </button>
        </form>

        <div className="auth-links">
          <Link href="/login">Terug naar login</Link>
        </div>
      </section>
    </main>
  );
}

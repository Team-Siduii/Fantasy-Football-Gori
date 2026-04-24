"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { AUTH_TEST_ACCOUNT_PRESETS } from "@/lib/auth-test-accounts";

const DEFAULT_PRESET = AUTH_TEST_ACCOUNT_PRESETS[0];

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [activePresetId, setActivePresetId] = useState(DEFAULT_PRESET.id);
  const [email, setEmail] = useState(DEFAULT_PRESET.email);
  const [password, setPassword] = useState(DEFAULT_PRESET.password);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const activePreset = useMemo(
    () => AUTH_TEST_ACCOUNT_PRESETS.find((preset) => preset.id === activePresetId) ?? DEFAULT_PRESET,
    [activePresetId],
  );

  function applyPreset(presetId: string) {
    const preset = AUTH_TEST_ACCOUNT_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    setActivePresetId(preset.id);
    setEmail(preset.email);
    setPassword(preset.password);
    setError("");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Login mislukt");
        return;
      }

      router.push(nextPath);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <h1>Manager login</h1>
        <p>Log in om je team, transfer pool en league-pagina te beheren.</p>

        <div className="auth-preset-list" aria-label="Testaccounts">
          {AUTH_TEST_ACCOUNT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="secondary-button"
              onClick={() => applyPreset(preset.id)}
              aria-pressed={activePresetId === preset.id}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="auth-helper-text">
          Actieve testlogin: <strong>{activePreset.email}</strong> · wachtwoord staat alvast ingevuld.
        </p>

        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>

          <label>
            Wachtwoord
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit" disabled={loading}>
            {loading ? "Inloggen..." : "Log in"}
          </button>
        </form>

        <div className="auth-links">
          <Link href="/forgot-password">Wachtwoord vergeten?</Link>
        </div>
      </section>
    </main>
  );
}

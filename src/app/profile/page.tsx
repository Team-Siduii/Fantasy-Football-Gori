"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Profile = {
  name: string;
  email: string;
  teamName: string;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/auth/profile");
      if (!response.ok) {
        setError("Kon profiel niet laden.");
        return;
      }

      const data = (await response.json()) as { profile: Profile };
      setProfile(data.profile);
      setName(data.profile.name);
      setTeamName(data.profile.teamName);
    };

    void load();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    const response = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, teamName }),
    });

    const data = (await response.json()) as { error?: string; profile?: Profile };
    if (!response.ok) {
      setError(data.error ?? "Opslaan mislukt");
      return;
    }

    if (data.profile) {
      setProfile(data.profile);
    }

    setMessage("Profiel opgeslagen.");
  }

  return (
    <AppShell title="Profile" subtitle="Beheer je managerprofiel.">
      <section className="card col-6">
        <h2>Account</h2>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Naam
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>

          <label>
            Teamnaam
            <input value={teamName} onChange={(event) => setTeamName(event.target.value)} required />
          </label>

          <label>
            Email
            <input value={profile?.email ?? ""} disabled />
          </label>

          {error ? <p className="error-text">{error}</p> : null}
          {message ? <p className="success-text">{message}</p> : null}

          <button type="submit">Opslaan</button>
        </form>
      </section>
    </AppShell>
  );
}

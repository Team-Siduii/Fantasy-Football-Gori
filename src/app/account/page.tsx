"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Profile = {
  name: string;
  email: string;
  teamName: string;
};

export default function AccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/auth/profile");
      if (!response.ok) {
        setError("Kon account niet laden.");
        return;
      }

      const data = (await response.json()) as { profile: Profile };
      setProfile(data.profile);
      setName(data.profile.name);
      setTeamName(data.profile.teamName);
    };

    void load();
  }, []);

  async function onSaveProfile(event: FormEvent<HTMLFormElement>) {
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

    setMessage("Account opgeslagen.");
  }

  async function onCompleteSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    const response = await fetch("/api/auth/complete-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode, newPassword, teamName }),
    });

    const data = (await response.json()) as { error?: string; profile?: Profile };
    if (!response.ok) {
      setError(data.error ?? "Eerste setup mislukt");
      return;
    }

    setInviteCode("");
    setNewPassword("");
    if (data.profile) {
      setProfile(data.profile);
      setName(data.profile.name);
      setTeamName(data.profile.teamName);
    }
    setMessage("Eerste setup voltooid. Je wachtwoord en teamnaam staan nu vast.");
  }

  async function onChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Wachtwoord wijzigen mislukt");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setMessage("Wachtwoord bijgewerkt.");
  }

  return (
    <AppShell title="Account" subtitle="Beheer je account, teamnaam en wachtwoord.">
      <section className="card col-6">
        <h2>Profiel</h2>
        <form onSubmit={onSaveProfile} className="auth-form">
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

          <button type="submit">Profiel opslaan</button>
        </form>
      </section>

      <section className="card col-6">
        <h2>Eerste login setup</h2>
        <p>Alleen nodig als je voor het eerst inlogt met een inlogcode.</p>
        <form onSubmit={onCompleteSetup} className="auth-form">
          <label>
            Inlogcode
            <input type="password" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} required />
          </label>
          <label>
            Nieuwe teamnaam
            <input value={teamName} onChange={(event) => setTeamName(event.target.value)} required />
          </label>
          <label>
            Nieuw wachtwoord
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required />
          </label>
          <button type="submit">Setup afronden</button>
        </form>
      </section>

      <section className="card col-6">
        <h2>Wachtwoord wijzigen/resetten</h2>
        <form onSubmit={onChangePassword} className="auth-form">
          <label>
            Huidig wachtwoord
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Nieuw wachtwoord
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required />
          </label>
          <button type="submit">Wachtwoord wijzigen</button>
        </form>
        <p>
          Wachtwoord kwijt? Gebruik <a href="/forgot-password">wachtwoord vergeten</a>.
        </p>

        {error ? <p className="error-text">{error}</p> : null}
        {message ? <p className="success-text">{message}</p> : null}
      </section>
    </AppShell>
  );
}

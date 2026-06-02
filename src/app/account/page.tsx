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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const response = await fetch("/api/auth/profile", { cache: "no-store" });
      if (!response.ok) {
        setError("Kon account niet laden.");
        setLoading(false);
        return;
      }

      const data = (await response.json()) as { profile: Profile };
      setProfile(data.profile);
      setName(data.profile.name);
      setTeamName(data.profile.teamName);
      setLoading(false);
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
      setName(data.profile.name);
      setTeamName(data.profile.teamName);
    }

    setMessage("Naam en teamnaam opgeslagen. De header en draftkamer gebruiken dit direct.");
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
    <AppShell title="Naam & teamnaam aanpassen" subtitle="Deze pagina is nu bewust prominent bereikbaar via de header en ondernavigatie.">
      <div className="account-dashboard">
        <section className="account-hero card col-12">
          <div>
            <p className="draft-eyebrow">Manager profiel</p>
            <h2>{loading ? "Account laden..." : profile?.name}</h2>
            <p>{profile?.email}</p>
          </div>
          <div className="account-team-badge">
            <span>Teamnaam</span>
            <strong>{profile?.teamName ?? "-"}</strong>
          </div>
        </section>

        <section className="card col-7 account-card-primary">
          <h2>Naam aanpassen</h2>
          <p>Gebruik hier de managernaam voor de draft en de teamnaam die in de app zichtbaar is.</p>
          <form onSubmit={onSaveProfile} className="auth-form">
            <label>
              Managernaam
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

            <button type="submit" disabled={loading}>Naam & teamnaam opslaan</button>
          </form>
        </section>

        <section className="card col-5">
          <h2>Wachtwoord</h2>
          <p>Voor oefensessies kun je het wachtwoord hier wijzigen. Reset kan ook via “wachtwoord vergeten”.</p>
          <form onSubmit={onChangePassword} className="auth-form">
            <label>
              Huidig wachtwoord
              <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
            </label>
            <label>
              Nieuw wachtwoord
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required />
            </label>
            <button type="submit">Wachtwoord wijzigen</button>
          </form>
          <p className="account-help-link">
            Wachtwoord kwijt? <a href="/forgot-password">Resetlink maken</a>
          </p>
        </section>

        {error ? <p className="error-text draft-message">{error}</p> : null}
        {message ? <p className="success-text draft-message">{message}</p> : null}
      </div>
    </AppShell>
  );
}

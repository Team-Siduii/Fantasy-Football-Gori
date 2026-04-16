"use client";

import { FormEvent, useEffect, useState } from "react";

type Player = {
  id: string;
  naam: string;
  club: string;
  positie: string;
  prijs: number;
};

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState<string>("");
  const [csvText, setCsvText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function loadPlayers() {
    const res = await fetch("/api/players", { cache: "no-store" });
    const data = await res.json();
    setPlayers(data.players ?? []);
    setCount(data.count ?? 0);
  }

  useEffect(() => {
    loadPlayers();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    const formData = new FormData();
    if (selectedFile) {
      formData.set("file", selectedFile);
    }
    if (csvText.trim().length > 0) {
      formData.set("csvText", csvText);
    }

    const res = await fetch("/api/players/upload", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      setMessage(`❌ Upload mislukt: ${data.error ?? "onbekende fout"}`);
      setIsLoading(false);
      return;
    }

    setMessage(`✅ Upload gelukt: ${data.count} spelers geladen.`);
    await loadPlayers();
    setIsLoading(false);
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "2rem 1rem", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 8 }}>Admin — Spelers uploaden (CSV)</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Verwachte kolommen: <code>id, naam, club, positie, prijs</code>
      </p>

      <form
        onSubmit={onSubmit}
        style={{ background: "#fff", border: "1px solid #e6e8ee", borderRadius: 12, padding: "1rem", marginBottom: "1rem" }}
      >
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>CSV bestand</label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
        />

        <p style={{ margin: "0.75rem 0 0.5rem", opacity: 0.7 }}>of plak CSV hier:</p>
        <textarea
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          rows={8}
          placeholder="id;naam;club;positie;prijs"
          style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", marginBottom: 12 }}
        />

        <button type="submit" disabled={isLoading}>
          {isLoading ? "Uploaden..." : "Upload CSV"}
        </button>
      </form>

      {message && (
        <p style={{ background: "#fff", border: "1px solid #e6e8ee", borderRadius: 12, padding: "0.75rem 1rem" }}>{message}</p>
      )}

      <section style={{ background: "#fff", border: "1px solid #e6e8ee", borderRadius: 12, padding: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Ingeladen spelers ({count})</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>ID</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>Naam</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>Club</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>Positie</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "0.5rem" }}>Prijs</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id}>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "0.5rem" }}>{player.id}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "0.5rem" }}>{player.naam}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "0.5rem" }}>{player.club}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "0.5rem" }}>{player.positie}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: "0.5rem", textAlign: "right" }}>{player.prijs.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

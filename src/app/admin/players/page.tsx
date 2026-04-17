"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

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
    <AppShell title="Admin — Spelers" subtitle="Upload je CSV en zie direct de ingeladen selectie.">
      <div className="grid">
        <form className="card col-6" onSubmit={onSubmit}>
          <h2>CSV upload</h2>
          <p>Ondersteund: standaard kolommen of Coach van het Jaar kolommen.</p>

          <label htmlFor="csv-file">CSV bestand</label>
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            style={{ margin: "0.4rem 0 0.8rem" }}
          />

          <label htmlFor="csv-text">Of plak CSV:</label>
          <textarea
            id="csv-text"
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            rows={10}
            placeholder="speler id,speler naam,positie,club,transferwaarde"
            style={{ margin: "0.4rem 0 0.8rem" }}
          />

          <button type="submit" disabled={isLoading}>
            {isLoading ? "Uploaden..." : "Upload CSV"}
          </button>
        </form>

        <section className="card col-6">
          <h2>Ingeladen ({count})</h2>
          <ul>
            <li>Doelvelden: id, naam, club, positie, prijs</li>
            <li>Posities worden genormaliseerd naar GK / DEF / MID / FWD</li>
            <li>Transferwaarde in miljoenen wordt automatisch omgerekend</li>
          </ul>
          {message ? <p>{message}</p> : null}
        </section>

        <section className="card col-12">
          <h2>Spelerslijst</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Naam</th>
                  <th>Club</th>
                  <th>Positie</th>
                  <th>Prijs (M)</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr key={player.id}>
                    <td>{player.id}</td>
                    <td>{player.naam}</td>
                    <td>{player.club}</td>
                    <td>{player.positie}</td>
                    <td>{player.prijs.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

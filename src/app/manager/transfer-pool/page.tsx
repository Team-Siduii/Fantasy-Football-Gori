"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import type { PlayerRecord } from "@/domain/player";
import { byPriceDesc } from "@/lib/player-derived";

export default function ManagerTransferPoolPage() {
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [selectedPosition, setSelectedPosition] = useState("ALL");
  const [search, setSearch] = useState("");
  const [pickedPlayerId, setPickedPlayerId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/players", { cache: "no-store" });
      if (!response.ok) {
        setMessage("Kon transfer pool niet laden.");
        return;
      }

      const data = (await response.json()) as { players: PlayerRecord[] };
      setPlayers((data.players || []).sort(byPriceDesc));
    };

    void load();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return players.filter((player) => {
      const positionOk = selectedPosition === "ALL" || player.positie === selectedPosition;
      const searchOk =
        query.length === 0 ||
        player.naam.toLowerCase().includes(query) ||
        player.club.toLowerCase().includes(query);

      return positionOk && searchOk;
    });
  }, [players, search, selectedPosition]);

  function handlePick(player: PlayerRecord) {
    setPickedPlayerId(player.id);
    setMessage(`${player.naam} klaar om binnen te halen voor € ${player.prijs.toFixed(2)}M.`);
  }

  return (
    <AppShell title="Transfer Pool" subtitle="Echte spelersdata uit CSV met filters en transferselectie.">
      <section className="card col-12">
        <h2>Beschikbare spelers</h2>

        <div className="grid">
          <label className="col-4">
            Zoek speler/club
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Bijv. Veerman" />
          </label>

          <label className="col-4">
            Positie
            <select value={selectedPosition} onChange={(event) => setSelectedPosition(event.target.value)}>
              <option value="ALL">Alle posities</option>
              <option value="GK">GK</option>
              <option value="DEF">DEF</option>
              <option value="MID">MID</option>
              <option value="FWD">FWD</option>
            </select>
          </label>

          <div className="col-4">
            <p className="muted-note">Resultaten: {filtered.length}</p>
            {message ? <p className="success-text">{message}</p> : null}
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Speler</th>
                <th>Positie</th>
                <th>Club</th>
                <th>Prijs</th>
                <th>Actie</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 120).map((item) => (
                <tr key={item.id}>
                  <td>{item.naam}</td>
                  <td>{item.positie}</td>
                  <td>{item.club}</td>
                  <td>€ {item.prijs.toFixed(2)}M</td>
                  <td>
                    <button type="button" onClick={() => handlePick(item)}>
                      {pickedPlayerId === item.id ? "Geselecteerd" : "Kies"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

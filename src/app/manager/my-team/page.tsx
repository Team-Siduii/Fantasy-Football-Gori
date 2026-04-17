"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { PlayerCard } from "@/components/player-card";
import { StatTile } from "@/components/stat-tile";
import { buildFormationSlots, getFormationOptions } from "@/domain/formation";
import { reorderAcrossZones, type ZoneName, type ZoneState } from "@/domain/lineup-state";
import type { PlayerRecord } from "@/domain/player";
import { enrichPlayers, type EnhancedPlayer } from "@/lib/player-derived";

type Position = "GK" | "DEF" | "MID" | "FWD";

function fallbackPlayers(): EnhancedPlayer[] {
  return enrichPlayers([
    { id: "1", naam: "Fallback Keeper", positie: "GK", club: "PSV", prijs: 5 },
    { id: "2", naam: "Fallback Def", positie: "DEF", club: "AJA", prijs: 5 },
    { id: "3", naam: "Fallback Mid", positie: "MID", club: "FEY", prijs: 5 },
    { id: "4", naam: "Fallback Fwd", positie: "FWD", club: "AZ", prijs: 5 },
  ]);
}

function buildStateForFormation(players: EnhancedPlayer[], formation: string): ZoneState<EnhancedPlayer> {
  const requiredSlots = buildFormationSlots(formation).flat();
  const usedIds = new Set<string>();

  const lineup = requiredSlots.map((position) => {
    const found = players.find((player) => player.positie === position && !usedIds.has(player.id));

    if (found) {
      usedIds.add(found.id);
      return found;
    }

    return {
      id: `open-${position}-${Math.random().toString(36).slice(2, 8)}`,
      positie: position as Position,
      naam: "Open slot",
      club: "Voeg speler toe",
      prijs: 0,
      punten: 0,
    } as EnhancedPlayer;
  });

  const bench = players.filter((player) => !usedIds.has(player.id));

  return { lineup, bench };
}

export default function ManagerMyTeamPage() {
  const formationOptions = getFormationOptions();
  const [formation, setFormation] = useState(formationOptions[0]);
  const [allPlayers, setAllPlayers] = useState<EnhancedPlayer[]>(fallbackPlayers());
  const [state, setState] = useState<ZoneState<EnhancedPlayer>>(() => buildStateForFormation(fallbackPlayers(), formationOptions[0]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/players", { cache: "no-store" });
        if (!response.ok) {
          setError("Spelers konden niet geladen worden.");
          setLoading(false);
          return;
        }

        const data = (await response.json()) as { players: PlayerRecord[] };
        const enriched = enrichPlayers(data.players || []);
        const nextPlayers = enriched.length > 0 ? enriched : fallbackPlayers();

        setAllPlayers(nextPlayers);
      } catch {
        setError("Netwerkfout bij het laden van spelers.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    setState(buildStateForFormation(allPlayers, formation));
  }, [allPlayers, formation]);

  const pitchRows = useMemo(() => {
    const rows = buildFormationSlots(formation);
    let cursor = 0;

    return rows.map((row) => {
      const cards = row.map(() => state.lineup[cursor]).filter(Boolean);
      cursor += row.length;
      return cards;
    });
  }, [formation, state.lineup]);

  function handleFormationChange(nextFormation: string) {
    setFormation(nextFormation);
  }

  function onDragStart(zone: ZoneName, index: number) {
    return (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.setData("text/plain", JSON.stringify({ zone, index }));
      event.dataTransfer.effectAllowed = "move";
    };
  }

  function onDrop(targetZone: ZoneName, targetIndex: number) {
    return (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("text/plain");
      if (!raw) return;

      const parsed = JSON.parse(raw) as { zone: ZoneName; index: number };
      setState((prev) =>
        reorderAcrossZones(prev, {
          sourceZone: parsed.zone,
          sourceIndex: parsed.index,
          targetZone,
          targetIndex,
        }),
      );
    };
  }

  return (
    <AppShell title="Team" subtitle="Opstelling met echte spelersdata uit CSV, plus drag & drop wissels.">
      <div className="grid">
        <section className="card col-8">
          <div className="formation-header">
            <h2>Basiselftal</h2>
            <label className="formation-select">
              Formatie
              <select value={formation} onChange={(event) => handleFormationChange(event.target.value)}>
                {formationOptions.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading ? <p className="muted-note">Spelers laden...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}

          <div className="pitch">
            {pitchRows.map((row, rowIndex) => {
              const rowStart = pitchRows.slice(0, rowIndex).reduce((sum, current) => sum + current.length, 0);

              return (
                <div key={`row-${rowIndex}`} className="pitch-row" data-size={row.length}>
                  {row.map((player, colIndex) => {
                    const lineupIndex = rowStart + colIndex;

                    return (
                      <PlayerCard
                        key={player.id}
                        draggable
                        position={player.positie}
                        club={player.club}
                        name={player.naam}
                        pointsLabel={`${player.punten} PN`}
                        onDragStart={onDragStart("lineup", lineupIndex)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={onDrop("lineup", lineupIndex)}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="stat-grid">
            <StatTile label="Totaal Punten" value={state.lineup.reduce((sum, player) => sum + player.punten, 0)} />
            <StatTile label="Resterend Budget" value="€ 98.5M" />
            <StatTile label="Beschikbare Transfers" value="2" />
            <StatTile label="Deadline Volgende Ronde" value="2 dagen, 4 uur" />
          </div>
        </section>

        <section className="card col-4">
          <h2>Wisselspelers</h2>
          <p className="muted-note">Sleep kaarten tussen basiselftal en bank om direct te wisselen.</p>
          <div className="bench-grid">
            {state.bench.slice(0, 8).map((player, benchIndex) => (
              <PlayerCard
                key={player.id}
                draggable
                position={player.positie}
                club={player.club}
                name={player.naam}
                pointsLabel={`${player.punten} PN`}
                onDragStart={onDragStart("bench", benchIndex)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop("bench", benchIndex)}
              />
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

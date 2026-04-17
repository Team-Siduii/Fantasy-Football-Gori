"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { PlayerCard } from "@/components/player-card";
import { StatTile } from "@/components/stat-tile";
import { buildFormationSlots, getFormationOptions } from "@/domain/formation";
import { reorderAcrossZones, type ZoneName, type ZoneState } from "@/domain/lineup-state";
import type { PlayerRecord } from "@/domain/player";
import { enrichPlayers, type EnhancedPlayer } from "@/lib/player-derived";

type Position = "GK" | "DEF" | "MID" | "FWD";

type ManagerStateResponse = {
  state?: {
    formation?: string;
    lineupIds?: string[];
    benchIds?: string[];
  };
};

function fallbackPlayers(): EnhancedPlayer[] {
  return enrichPlayers([
    { id: "1", naam: "Fallback Keeper", positie: "GK", club: "PSV", prijs: 5 },
    { id: "2", naam: "Fallback Def", positie: "DEF", club: "AJA", prijs: 5 },
    { id: "3", naam: "Fallback Mid", positie: "MID", club: "FEY", prijs: 5 },
    { id: "4", naam: "Fallback Fwd", positie: "FWD", club: "AZ", prijs: 5 },
  ]);
}

function createOpenSlot(position: string): EnhancedPlayer {
  return {
    id: `open-${position}-${Math.random().toString(36).slice(2, 8)}`,
    positie: position as Position,
    naam: "Open slot",
    club: "Voeg speler toe",
    prijs: 0,
    punten: 0,
  };
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

    return createOpenSlot(position);
  });

  const bench = players.filter((player) => !usedIds.has(player.id));
  return { lineup, bench };
}

function buildStateFromSaved(players: EnhancedPlayer[], formation: string, lineupIds: string[], benchIds: string[]) {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const requiredSlots = buildFormationSlots(formation).flat();
  const usedIds = new Set<string>();

  const lineup = requiredSlots.map((position, index) => {
    const savedId = lineupIds[index];
    const saved = savedId ? playersById.get(savedId) : undefined;

    if (saved && saved.positie === position && !usedIds.has(saved.id)) {
      usedIds.add(saved.id);
      return saved;
    }

    const fallback = players.find((player) => player.positie === position && !usedIds.has(player.id));
    if (fallback) {
      usedIds.add(fallback.id);
      return fallback;
    }

    return createOpenSlot(position);
  });

  const bench: EnhancedPlayer[] = [];
  for (const id of benchIds) {
    const player = playersById.get(id);
    if (player && !usedIds.has(player.id)) {
      usedIds.add(player.id);
      bench.push(player);
    }
  }

  for (const player of players) {
    if (!usedIds.has(player.id)) {
      usedIds.add(player.id);
      bench.push(player);
    }
  }

  return { lineup, bench };
}

export default function ManagerMyTeamPage() {
  const formationOptions = useMemo(() => getFormationOptions(), []);
  const [formation, setFormation] = useState(formationOptions[0]);
  const [allPlayers, setAllPlayers] = useState<EnhancedPlayer[]>(fallbackPlayers());
  const [state, setState] = useState<ZoneState<EnhancedPlayer>>(() => buildStateForFormation(fallbackPlayers(), formationOptions[0]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const hydrated = useRef(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const [playersResponse, managerStateResponse] = await Promise.all([
          fetch("/api/players", { cache: "no-store" }),
          fetch("/api/manager/state", { cache: "no-store" }),
        ]);

        if (!playersResponse.ok) {
          setError("Spelers konden niet geladen worden.");
          setLoading(false);
          return;
        }

        const playersData = (await playersResponse.json()) as { players: PlayerRecord[] };
        const managerData = managerStateResponse.ok
          ? ((await managerStateResponse.json()) as ManagerStateResponse)
          : { state: undefined };

        const enriched = enrichPlayers(playersData.players || []);
        const nextPlayers = enriched.length > 0 ? enriched : fallbackPlayers();
        const savedFormation = managerData.state?.formation;
        const initialFormation =
          savedFormation && formationOptions.includes(savedFormation) ? savedFormation : formationOptions[0];

        setAllPlayers(nextPlayers);
        setFormation(initialFormation);

        const nextState =
          managerData.state?.lineupIds || managerData.state?.benchIds
            ? buildStateFromSaved(
                nextPlayers,
                initialFormation,
                managerData.state?.lineupIds ?? [],
                managerData.state?.benchIds ?? [],
              )
            : buildStateForFormation(nextPlayers, initialFormation);

        setState(nextState);
        hydrated.current = true;
      } catch {
        setError("Netwerkfout bij het laden van spelers.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [formationOptions]);

  useEffect(() => {
    if (!hydrated.current) {
      return;
    }

    const lineupIds = state.lineup.filter((player) => !player.id.startsWith("open-")).map((player) => player.id);
    const benchIds = state.bench.filter((player) => !player.id.startsWith("open-")).map((player) => player.id);

    const controller = new AbortController();
    void fetch("/api/manager/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formation, lineupIds, benchIds }),
      signal: controller.signal,
    }).catch(() => {
      // no-op: UX blijft werken als persistence tijdelijk faalt
    });

    return () => controller.abort();
  }, [formation, state]);

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
    setState((previous) => {
      const nonOpen = [...previous.lineup, ...previous.bench].filter((player) => !player.id.startsWith("open-"));
      return buildStateForFormation(nonOpen.length > 0 ? nonOpen : allPlayers, nextFormation);
    });
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
              <select value={formation} onChange={(event) => handleFormationChange(event.target.value)} data-testid="formation-select">
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
                        key={`lineup-${lineupIndex}-${player.id}`}
                        data-testid={`lineup-card-${lineupIndex}`}
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
                key={`bench-${benchIndex}-${player.id}`}
                data-testid={`bench-card-${benchIndex}`}
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

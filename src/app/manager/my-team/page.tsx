"use client";

import { useMemo, useState, type DragEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { buildFormationSlots, getFormationOptions } from "@/domain/formation";
import { reorderAcrossZones, type ZoneName, type ZoneState } from "@/domain/lineup-state";

type Position = "GK" | "DEF" | "MID" | "FWD";

type PlayerCard = {
  id: string;
  naam: string;
  positie: Position;
  club: string;
  waarde: string;
  punten: number;
};

const allPlayers: PlayerCard[] = [
  { id: "p1", positie: "GK", naam: "Nick Olij", club: "Sparta", waarde: "€ 6.0M", punten: 23 },
  { id: "p2", positie: "GK", naam: "Justin Bijlow", club: "Feyenoord", waarde: "€ 6.5M", punten: 18 },
  { id: "p3", positie: "DEF", naam: "Jorrel Hato", club: "Ajax", waarde: "€ 7.5M", punten: 25 },
  { id: "p4", positie: "DEF", naam: "Quilindschy Hartman", club: "Feyenoord", waarde: "€ 7.0M", punten: 20 },
  { id: "p5", positie: "DEF", naam: "Jordan Teze", club: "PSV", waarde: "€ 6.5M", punten: 19 },
  { id: "p6", positie: "DEF", naam: "Robin Pröpper", club: "Twente", waarde: "€ 5.0M", punten: 23 },
  { id: "p7", positie: "DEF", naam: "Lutsharel Geertruida", club: "Feyenoord", waarde: "€ 7.0M", punten: 22 },
  { id: "p8", positie: "MID", naam: "Joey Veerman", club: "PSV", waarde: "€ 8.5M", punten: 24 },
  { id: "p9", positie: "MID", naam: "Quinten Timber", club: "Feyenoord", waarde: "€ 9.0M", punten: 21 },
  { id: "p10", positie: "MID", naam: "Kian Fitz-Jim", club: "Ajax", waarde: "€ 6.0M", punten: 17 },
  { id: "p11", positie: "MID", naam: "Sven Mijnans", club: "AZ", waarde: "€ 6.5M", punten: 20 },
  { id: "p12", positie: "MID", naam: "Mats Wieffer", club: "Feyenoord", waarde: "€ 8.0M", punten: 16 },
  { id: "p13", positie: "FWD", naam: "Brian Brobbey", club: "Ajax", waarde: "€ 9.0M", punten: 25 },
  { id: "p14", positie: "FWD", naam: "Luuk de Jong", club: "PSV", waarde: "€ 10.0M", punten: 22 },
  { id: "p15", positie: "FWD", naam: "Igor Paixão", club: "Feyenoord", waarde: "€ 8.0M", punten: 20 },
  { id: "p16", positie: "FWD", naam: "Sem Steijn", club: "Twente", waarde: "€ 8.0M", punten: 15 },
];

function buildStateForFormation(players: PlayerCard[], formation: string): ZoneState<PlayerCard> {
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
      positie: position,
      naam: "Open slot",
      club: "Voeg speler toe",
      waarde: "-",
      punten: 0,
    } as PlayerCard;
  });

  const bench = players.filter((player) => !usedIds.has(player.id));

  return { lineup, bench };
}

export default function ManagerMyTeamPage() {
  const formationOptions = getFormationOptions();
  const [formation, setFormation] = useState(formationOptions[0]);
  const [state, setState] = useState<ZoneState<PlayerCard>>(() => buildStateForFormation(allPlayers, formationOptions[0]));

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
    const mergedPlayers = [...state.lineup, ...state.bench].filter((player) => !player.id.startsWith("open-"));
    setFormation(nextFormation);
    setState(buildStateForFormation(mergedPlayers, nextFormation));
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
    <AppShell title="Team" subtitle="4-3-3 stijl opstelling met kaarten, bank en live wisselen.">
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

          <div className="pitch">
            {pitchRows.map((row, rowIndex) => {
              const rowStart = pitchRows.slice(0, rowIndex).reduce((sum, current) => sum + current.length, 0);

              return (
                <div key={`row-${rowIndex}`} className="pitch-row" data-size={row.length}>
                  {row.map((player, colIndex) => {
                    const lineupIndex = rowStart + colIndex;

                    return (
                      <article
                        key={player.id}
                        className="player-card draggable"
                        draggable
                        onDragStart={onDragStart("lineup", lineupIndex)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={onDrop("lineup", lineupIndex)}
                      >
                        <div className="player-top">
                          <span className="player-position">{player.positie}</span>
                          <span className="player-club">{player.club}</span>
                        </div>
                        <p className="player-name">{player.naam}</p>
                        <p className="player-points">{player.punten} PN</p>
                      </article>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="stat-grid">
            <article className="stat-tile">
              <span>Totaal Punten</span>
              <strong>190</strong>
            </article>
            <article className="stat-tile">
              <span>Resterend Budget</span>
              <strong>€ 98.5M</strong>
            </article>
            <article className="stat-tile">
              <span>Beschikbare Transfers</span>
              <strong>2</strong>
            </article>
            <article className="stat-tile">
              <span>Deadline Volgende Ronde</span>
              <strong>2 dagen, 4 uur</strong>
            </article>
          </div>
        </section>

        <section className="card col-4">
          <h2>Wisselspelers</h2>
          <p className="muted-note">Sleep kaarten tussen basiselftal en bank om direct te wisselen.</p>
          <div className="bench-grid">
            {state.bench.map((player, benchIndex) => (
              <article
                key={player.id}
                className="player-card draggable"
                draggable
                onDragStart={onDragStart("bench", benchIndex)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop("bench", benchIndex)}
              >
                <div className="player-top">
                  <span className="player-position">{player.positie}</span>
                  <span className="player-club">{player.club}</span>
                </div>
                <p className="player-name">{player.naam}</p>
                <p className="player-points">{player.punten} PN</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

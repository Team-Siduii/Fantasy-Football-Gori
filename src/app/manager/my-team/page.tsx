"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { PlayerCard } from "@/components/player-card";
import { StatTile } from "@/components/stat-tile";
import { buildFormationSlots, getFormationOptions } from "@/domain/formation";
import { reorderAcrossZones, type ZoneName, type ZoneState } from "@/domain/lineup-state";
import type { PlayerRecord } from "@/domain/player";
import {
  applyConfirmedTransfer,
  buildMarketPlayers,
  type TransferState,
} from "@/domain/transfer-workflow";
import { byPriceDesc, enrichPlayers, type EnhancedPlayer } from "@/lib/player-derived";

type Position = "GK" | "DEF" | "MID" | "FWD";

const BENCH_LIMIT = 4;

type ManagerStateResponse = {
  state?: {
    formation?: string;
    lineupIds?: string[];
    benchIds?: string[];
    pickedTransferId?: string | null;
    pendingSellId?: string | null;
    pendingBuyId?: string | null;
  };
};

function fallbackPlayers(): EnhancedPlayer[] {
  return enrichPlayers([
    { id: "1", naam: "Fallback Keeper", positie: "GK", club: "PSV", prijs: 5 },
    { id: "2", naam: "Fallback Def", positie: "DEF", club: "AJA", prijs: 5 },
    { id: "3", naam: "Fallback Mid", positie: "MID", club: "FEY", prijs: 5 },
    { id: "4", naam: "Fallback Mid 2", positie: "MID", club: "AZ", prijs: 6 },
    { id: "5", naam: "Fallback Fwd", positie: "FWD", club: "UTR", prijs: 6 },
    { id: "6", naam: "Fallback Def 2", positie: "DEF", club: "TWE", prijs: 5 },
    { id: "7", naam: "Fallback Def 3", positie: "DEF", club: "SPA", prijs: 5 },
    { id: "8", naam: "Fallback Def 4", positie: "DEF", club: "WIL", prijs: 5 },
    { id: "9", naam: "Fallback Mid 3", positie: "MID", club: "HEE", prijs: 6 },
    { id: "10", naam: "Fallback Fwd 2", positie: "FWD", club: "NEC", prijs: 6 },
    { id: "11", naam: "Fallback Mid 4", positie: "MID", club: "GAE", prijs: 6 },
    { id: "12", naam: "Fallback Def 5", positie: "DEF", club: "NAC", prijs: 5 },
    { id: "13", naam: "Fallback Mid 5", positie: "MID", club: "PEC", prijs: 6 },
    { id: "14", naam: "Fallback Fwd 3", positie: "FWD", club: "RKC", prijs: 7 },
    { id: "15", naam: "Fallback Keeper 2", positie: "GK", club: "FOR", prijs: 5 },
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

  const bench = players.filter((player) => !usedIds.has(player.id)).slice(0, BENCH_LIMIT);
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
    if (bench.length >= BENCH_LIMIT) {
      break;
    }

    const player = playersById.get(id);
    if (player && !usedIds.has(player.id)) {
      usedIds.add(player.id);
      bench.push(player);
    }
  }

  for (const player of players) {
    if (bench.length >= BENCH_LIMIT) {
      break;
    }

    if (!usedIds.has(player.id)) {
      usedIds.add(player.id);
      bench.push(player);
    }
  }

  return { lineup, bench };
}

function toPersistedIds(state: ZoneState<EnhancedPlayer>) {
  return {
    lineupIds: state.lineup.filter((player) => !player.id.startsWith("open-")).map((player) => player.id),
    benchIds: state.bench.filter((player) => !player.id.startsWith("open-")).map((player) => player.id),
  };
}

export default function ManagerMyTeamPage() {
  const formationOptions = useMemo(() => getFormationOptions(), []);
  const [formation, setFormation] = useState(formationOptions[0]);
  const [allPlayers, setAllPlayers] = useState<EnhancedPlayer[]>(fallbackPlayers());
  const [state, setState] = useState<ZoneState<EnhancedPlayer>>(() => buildStateForFormation(fallbackPlayers(), formationOptions[0]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pendingSellId, setPendingSellId] = useState<string | null>(null);
  const [pendingBuyId, setPendingBuyId] = useState<string | null>(null);
  const [transferMessage, setTransferMessage] = useState("");

  const [search, setSearch] = useState("");
  const [selectedPosition, setSelectedPosition] = useState("ALL");
  const [selectedClub, setSelectedClub] = useState("ALL");
  const [maxPrice, setMaxPrice] = useState(0);

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

        const enriched = enrichPlayers(playersData.players || []).sort(byPriceDesc);
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

        setPendingSellId(managerData.state?.pendingSellId ?? null);
        setPendingBuyId(managerData.state?.pendingBuyId ?? managerData.state?.pickedTransferId ?? null);

        const maxAvailable = Math.max(0, ...nextPlayers.map((player) => player.prijs));
        setMaxPrice(maxAvailable);

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

    const { lineupIds, benchIds } = toPersistedIds(state);

    const controller = new AbortController();
    void fetch("/api/manager/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formation,
        lineupIds,
        benchIds,
        pendingSellId,
        pendingBuyId,
        pickedTransferId: pendingBuyId,
      }),
      signal: controller.signal,
    }).catch(() => {
      // no-op: UX blijft werken als persistence tijdelijk faalt
    });

    return () => controller.abort();
  }, [formation, pendingBuyId, pendingSellId, state]);

  const pitchRows = useMemo(() => {
    const rows = buildFormationSlots(formation);
    let cursor = 0;

    return rows.map((row) => {
      const cards = row.map(() => state.lineup[cursor]).filter(Boolean);
      cursor += row.length;
      return cards;
    });
  }, [formation, state.lineup]);

  const squadPlayers = useMemo(() => {
    return [...state.lineup, ...state.bench].filter((player) => !player.id.startsWith("open-"));
  }, [state.bench, state.lineup]);

  const pendingSellPlayer = useMemo(
    () => squadPlayers.find((player) => player.id === pendingSellId) ?? null,
    [pendingSellId, squadPlayers],
  );

  const marketPlayers = useMemo(() => {
    const { lineupIds, benchIds } = toPersistedIds(state);
    return buildMarketPlayers(allPlayers, lineupIds, benchIds);
  }, [allPlayers, state]);

  const availableClubs = useMemo(() => {
    return Array.from(new Set(marketPlayers.map((player) => player.club))).sort();
  }, [marketPlayers]);

  const maxAvailablePrice = useMemo(() => Math.max(0, ...marketPlayers.map((player) => player.prijs)), [marketPlayers]);

  useEffect(() => {
    setMaxPrice((current) => {
      if (maxAvailablePrice === 0) {
        return 0;
      }

      if (current <= 0 || current > maxAvailablePrice) {
        return maxAvailablePrice;
      }

      return current;
    });
  }, [maxAvailablePrice]);

  const filteredMarket = useMemo(() => {
    const query = search.trim().toLowerCase();

    return marketPlayers.filter((player) => {
      const requiredPosition = pendingSellPlayer?.positie;
      const positionMatch = requiredPosition
        ? player.positie === requiredPosition
        : selectedPosition === "ALL" || player.positie === selectedPosition;

      const clubMatch = selectedClub === "ALL" || player.club === selectedClub;
      const searchMatch =
        query.length === 0 || player.naam.toLowerCase().includes(query) || player.club.toLowerCase().includes(query);
      const priceMatch = player.prijs <= maxPrice;

      return positionMatch && clubMatch && searchMatch && priceMatch;
    });
  }, [marketPlayers, maxPrice, pendingSellPlayer, search, selectedClub, selectedPosition]);

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
        reorderAcrossZones(
          prev,
          {
            sourceZone: parsed.zone,
            sourceIndex: parsed.index,
            targetZone,
            targetIndex,
          },
          {
            enforceLineupPosition: true,
            getPosition: (player) => player.positie,
          },
        ),
      );
    };
  }

  function handleSellSelection(playerId: string) {
    if (!playerId) {
      setPendingSellId(null);
      setPendingBuyId(null);
      setTransferMessage("Selecteer eerst een speler die je wilt verkopen.");
      return;
    }

    const selected = squadPlayers.find((player) => player.id === playerId);
    setPendingSellId(playerId);

    if (!selected) {
      setTransferMessage("Verkoopspeler niet gevonden.");
      return;
    }

    if (pendingBuyId) {
      const pendingBuyPlayer = allPlayers.find((player) => player.id === pendingBuyId);
      if (!pendingBuyPlayer || pendingBuyPlayer.positie !== selected.positie) {
        setPendingBuyId(null);
      }
    }

    setTransferMessage(`Je verkoopt ${selected.naam}. Kies nu een nieuwe ${selected.positie}.`);
  }

  function handlePickIncoming(player: EnhancedPlayer) {
    if (!pendingSellPlayer) {
      setTransferMessage("Verkoop eerst een speler voordat je een vervanger kiest.");
      return;
    }

    if (player.positie !== pendingSellPlayer.positie) {
      setTransferMessage(`Alleen ${pendingSellPlayer.positie} is toegestaan als vervanging.`);
      return;
    }

    setPendingBuyId(player.id);
    setTransferMessage(`${player.naam} staat klaar. Klik op 'Bevestig transfer' om af te ronden.`);
  }

  function handleConfirmTransfer() {
    const persisted = toPersistedIds(state);
    const nextTransferState: TransferState = {
      lineupIds: persisted.lineupIds,
      benchIds: persisted.benchIds,
      pendingSellId,
      pendingBuyId,
    };

    const next = applyConfirmedTransfer(nextTransferState, allPlayers);

    if (next === nextTransferState) {
      setTransferMessage("Transfer kon niet bevestigd worden. Controleer positie of selectie.");
      return;
    }

    const nextState = buildStateFromSaved(allPlayers, formation, next.lineupIds, next.benchIds);
    setState(nextState);
    setPendingSellId(null);
    setPendingBuyId(null);
    setTransferMessage("Transfer bevestigd en direct verwerkt in je team.");
  }

  return (
    <AppShell title="Team" subtitle="Opstelling, wissels en transfermarkt in één overzicht.">
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
                        draggable={!player.id.startsWith("open-")}
                        position={player.positie}
                        club={player.club}
                        name={player.naam}
                        pointsLabel={`${player.punten} PN`}
                        className={pendingSellId === player.id ? "player-card--sell" : undefined}
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
            <StatTile label="Transfers deze ronde" value="1" />
            <StatTile label="Deadline Volgende Ronde" value="2 dagen, 4 uur" />
          </div>
        </section>

        <section className="card col-4">
          <h2>Wisselspelers</h2>
          <p className="muted-note">Maximaal {BENCH_LIMIT} wissels zichtbaar. Drag & drop respecteert positie-slots.</p>
          <div className="bench-grid">
            {state.bench.slice(0, BENCH_LIMIT).map((player, benchIndex) => (
              <PlayerCard
                key={`bench-${benchIndex}-${player.id}`}
                data-testid={`bench-card-${benchIndex}`}
                draggable
                position={player.positie}
                club={player.club}
                name={player.naam}
                pointsLabel={`${player.punten} PN`}
                className={pendingSellId === player.id ? "player-card--sell" : undefined}
                onDragStart={onDragStart("bench", benchIndex)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop("bench", benchIndex)}
              />
            ))}
          </div>
        </section>

        <section className="card col-12" id="transfermarkt">
          <h2>Transfermarkt (onder teamoverzicht)</h2>
          <p className="muted-note">Flow: 1) verkoop kiezen, 2) vervanger kiezen, 3) transfer bevestigen.</p>

          <div className="grid transfer-controls">
            <label className="col-4">
              1) Verkoop speler
              <select
                value={pendingSellId ?? ""}
                onChange={(event) => handleSellSelection(event.target.value)}
                data-testid="sell-player-select"
              >
                <option value="">Kies speler om te verkopen</option>
                {squadPlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.naam} ({player.positie}) - {player.club}
                  </option>
                ))}
              </select>
            </label>

            <label className="col-2">
              Positie
              <select
                value={pendingSellPlayer?.positie ?? selectedPosition}
                onChange={(event) => setSelectedPosition(event.target.value)}
                disabled={Boolean(pendingSellPlayer)}
                data-testid="transfer-position"
              >
                <option value="ALL">Alle posities</option>
                <option value="GK">GK</option>
                <option value="DEF">DEF</option>
                <option value="MID">MID</option>
                <option value="FWD">FWD</option>
              </select>
            </label>

            <label className="col-3">
              Club
              <select value={selectedClub} onChange={(event) => setSelectedClub(event.target.value)} data-testid="transfer-club">
                <option value="ALL">Alle clubs</option>
                {availableClubs.map((club) => (
                  <option key={club} value={club}>
                    {club}
                  </option>
                ))}
              </select>
            </label>

            <label className="col-3">
              Zoek speler/club
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Bijv. Veerman"
                data-testid="transfer-search"
              />
            </label>

            <label className="col-6 transfer-price-filter">
              Transferwaarde t/m € {maxPrice.toFixed(2)}M
              <input
                type="range"
                min={0}
                max={maxAvailablePrice || 0}
                step={0.1}
                value={maxPrice}
                onChange={(event) => setMaxPrice(Number(event.target.value))}
                data-testid="transfer-price-slider"
              />
            </label>

            <div className="col-6 transfer-status-wrap">
              <p className="muted-note">Resultaten: {filteredMarket.length}</p>
              {transferMessage ? <p className="success-text">{transferMessage}</p> : null}
              <button
                type="button"
                onClick={handleConfirmTransfer}
                disabled={!pendingSellId || !pendingBuyId}
                data-testid="confirm-transfer"
              >
                Bevestig transfer
              </button>
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
                {filteredMarket.slice(0, 120).map((item, index) => (
                  <tr key={item.id} data-testid={`transfer-row-${index}`}>
                    <td>{item.naam}</td>
                    <td>{item.positie}</td>
                    <td>{item.club}</td>
                    <td>€ {item.prijs.toFixed(2)}M</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handlePickIncoming(item)}
                        disabled={!pendingSellId}
                        data-testid={`transfer-pick-${index}`}
                      >
                        {pendingBuyId === item.id ? "Klaar voor bevestiging" : "Koop"}
                      </button>
                    </td>
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

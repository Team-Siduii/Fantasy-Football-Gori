"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { PlayerCard } from "@/components/player-card";
import { StatTile } from "@/components/stat-tile";
import { buildFormationSlots, getFormationOptions } from "@/domain/formation";
import { reorderAcrossZones, type ZoneName, type ZoneState } from "@/domain/lineup-state";
import { buildPitchRows } from "@/domain/pitch-layout";
import {
  MAX_TRANSFER_BUDGET_MILLIONS,
  calculateRemainingBudget,
  calculateSquadCost,
  isWithinBudget,
} from "@/domain/team-budget";
import type { PlayerRecord } from "@/domain/player";
import { buildMarketPlayers } from "@/domain/transfer-workflow";
import { byPriceDesc, enrichPlayers, type EnhancedPlayer } from "@/lib/player-derived";

type Position = "GK" | "DEF" | "MID" | "FWD";

const BENCH_LIMIT = 4;
const BENCH_POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

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
    { id: "1", naam: "Demo Keeper", positie: "GK", club: "PSV", prijs: 2 },
    { id: "2", naam: "Demo Def 1", positie: "DEF", club: "AJA", prijs: 2 },
    { id: "3", naam: "Demo Mid 1", positie: "MID", club: "FEY", prijs: 2.5 },
    { id: "4", naam: "Demo Mid 2", positie: "MID", club: "AZ", prijs: 2.5 },
    { id: "5", naam: "Demo Fwd 1", positie: "FWD", club: "UTR", prijs: 3 },
    { id: "6", naam: "Demo Def 2", positie: "DEF", club: "TWE", prijs: 2 },
    { id: "7", naam: "Demo Def 3", positie: "DEF", club: "SPA", prijs: 2 },
    { id: "8", naam: "Demo Def 4", positie: "DEF", club: "WIL", prijs: 1.5 },
    { id: "9", naam: "Demo Mid 3", positie: "MID", club: "HEE", prijs: 2 },
    { id: "10", naam: "Demo Fwd 2", positie: "FWD", club: "NEC", prijs: 3 },
    { id: "11", naam: "Demo Mid 4", positie: "MID", club: "GAE", prijs: 2 },
    { id: "12", naam: "Demo Def 5", positie: "DEF", club: "NAC", prijs: 1.5 },
    { id: "13", naam: "Demo Mid 5", positie: "MID", club: "PEC", prijs: 1.5 },
    { id: "14", naam: "Demo Fwd 3", positie: "FWD", club: "RKC", prijs: 2.5 },
    { id: "15", naam: "Demo Keeper 2", positie: "GK", club: "FOR", prijs: 1.5 },
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

function countOpenSlots(state: ZoneState<EnhancedPlayer>) {
  return [...state.lineup, ...state.bench].filter((player) => player.id.startsWith("open-")).length;
}

function buildStateWithVacancies(
  players: EnhancedPlayer[],
  formation: string,
  vacancyCount: number,
): ZoneState<EnhancedPlayer> | null {
  const requiredLineup = buildFormationSlots(formation).flat();
  const byPosition = new Map<Position, EnhancedPlayer[]>([
    ["GK", []],
    ["DEF", []],
    ["MID", []],
    ["FWD", []],
  ]);

  for (const player of players) {
    const position = player.positie as Position;
    if (!byPosition.has(position)) {
      continue;
    }

    byPosition.get(position)?.push(player);
  }

  let remainingVacancies = vacancyCount;

  const takePlayerForPosition = (position: Position) => {
    const list = byPosition.get(position);
    if (!list || list.length === 0) {
      if (remainingVacancies <= 0) {
        return null;
      }

      remainingVacancies -= 1;
      return createOpenSlot(position);
    }

    return list.shift() ?? null;
  };

  const lineup: EnhancedPlayer[] = [];
  for (const position of requiredLineup) {
    const next = takePlayerForPosition(position as Position);
    if (!next) {
      return null;
    }

    lineup.push(next);
  }

  const bench: EnhancedPlayer[] = [];
  for (const position of BENCH_POSITIONS) {
    const next = takePlayerForPosition(position);
    if (!next) {
      return null;
    }

    bench.push(next);
  }

  const hasUnplacedPlayers = [...byPosition.values()].some((list) => list.length > 0);
  if (hasUnplacedPlayers || remainingVacancies !== 0) {
    return null;
  }

  return { lineup, bench };
}

function buildStateForFormation(players: EnhancedPlayer[], formation: string): ZoneState<EnhancedPlayer> {
  return buildStateWithVacancies(players, formation, 0) ?? {
    lineup: buildFormationSlots(formation).flat().map((position) => createOpenSlot(position)),
    bench: BENCH_POSITIONS.map((position) => createOpenSlot(position)),
  };
}

function buildBudgetDemoState(players: EnhancedPlayer[], formation: string): ZoneState<EnhancedPlayer> {
  const ordered = [...players].sort((a, b) => a.prijs - b.prijs || a.naam.localeCompare(b.naam));
  const candidate = buildStateWithVacancies(ordered, formation, 0);

  if (candidate && isWithinBudget([...candidate.lineup, ...candidate.bench], MAX_TRANSFER_BUDGET_MILLIONS)) {
    return candidate;
  }

  return buildStateForFormation(ordered, formation);
}

function buildStateForFormationWithVacancies(
  players: EnhancedPlayer[],
  formation: string,
  vacancyCount: number,
): ZoneState<EnhancedPlayer> | null {
  return buildStateWithVacancies(players, formation, vacancyCount);
}

function buildStateFromSaved(players: EnhancedPlayer[], formation: string, lineupIds: string[], benchIds: string[]) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const seen = new Set<string>();

  const preferred: EnhancedPlayer[] = [];
  for (const id of [...lineupIds, ...benchIds]) {
    const player = byId.get(id);
    if (player && !seen.has(player.id)) {
      seen.add(player.id);
      preferred.push(player);
    }
  }

  for (const player of players) {
    if (!seen.has(player.id)) {
      seen.add(player.id);
      preferred.push(player);
    }
  }

  return buildStateForFormation(preferred, formation);
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
  const [state, setState] = useState<ZoneState<EnhancedPlayer>>(() => buildBudgetDemoState(fallbackPlayers(), formationOptions[0]));
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

        const hydratedState =
          managerData.state?.lineupIds || managerData.state?.benchIds
            ? buildStateFromSaved(
                nextPlayers,
                initialFormation,
                managerData.state?.lineupIds ?? [],
                managerData.state?.benchIds ?? [],
              )
            : buildBudgetDemoState(nextPlayers, initialFormation);

        let nextState = isWithinBudget(
          [...hydratedState.lineup, ...hydratedState.bench],
          MAX_TRANSFER_BUDGET_MILLIONS,
        )
          ? hydratedState
          : buildBudgetDemoState(nextPlayers, initialFormation);

        const savedPendingSellId = managerData.state?.pendingSellId ?? null;
        if (savedPendingSellId) {
          const playersWithoutSold = [...nextState.lineup, ...nextState.bench].filter(
            (player) => !player.id.startsWith("open-") && player.id !== savedPendingSellId,
          );
          const rebuilt = buildStateForFormationWithVacancies(playersWithoutSold, initialFormation, 1);
          if (rebuilt) {
            nextState = rebuilt;
          }
        }

        setState(nextState);

        setPendingSellId(savedPendingSellId);
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
    return buildPitchRows(formation, state.lineup);
  }, [formation, state.lineup]);

  const squadPlayers = useMemo(() => {
    return [...state.lineup, ...state.bench].filter((player) => !player.id.startsWith("open-"));
  }, [state.bench, state.lineup]);

  const squadCost = useMemo(() => calculateSquadCost(squadPlayers), [squadPlayers]);
  const remainingBudget = useMemo(
    () => calculateRemainingBudget(squadPlayers, MAX_TRANSFER_BUDGET_MILLIONS),
    [squadPlayers],
  );

  const openSlots = useMemo(
    () => [...state.lineup, ...state.bench].filter((player) => player.id.startsWith("open-")),
    [state.bench, state.lineup],
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
      const positionMatch = selectedPosition === "ALL" || player.positie === selectedPosition;

      const clubMatch = selectedClub === "ALL" || player.club === selectedClub;
      const searchMatch =
        query.length === 0 || player.naam.toLowerCase().includes(query) || player.club.toLowerCase().includes(query);
      const priceMatch = player.prijs <= maxPrice;

      return positionMatch && clubMatch && searchMatch && priceMatch;
    });
  }, [marketPlayers, maxPrice, search, selectedClub, selectedPosition]);

  function handleFormationChange(nextFormation: string) {
    const nonOpen = [...state.lineup, ...state.bench].filter((player) => !player.id.startsWith("open-"));
    const openCount = countOpenSlots(state);

    if (openCount > 0) {
      const rebuilt = buildStateForFormationWithVacancies(nonOpen, nextFormation, openCount);
      if (!rebuilt) {
        setTransferMessage("je kunt niet in deze formatie spelen met deze spelers");
        return;
      }

      setFormation(nextFormation);
      setState(rebuilt);
      return;
    }

    setFormation(nextFormation);
    setState(buildStateForFormation(nonOpen.length > 0 ? nonOpen : allPlayers, nextFormation));
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
      return;
    }

    if (openSlots.length > 0) {
      setTransferMessage("Rond eerst je open transfer af door een vervanger te kopen.");
      return;
    }

    setState((previous) => {
      const nextLineup = [...previous.lineup];
      const nextBench = [...previous.bench];

      const lineupIndex = nextLineup.findIndex((player) => player.id === playerId);
      if (lineupIndex >= 0) {
        const sold = nextLineup[lineupIndex];
        nextLineup[lineupIndex] = createOpenSlot(sold.positie);
        setPendingSellId(playerId);
        setPendingBuyId(null);
        setTransferMessage(`${sold.naam} is verkocht. Kies nu een nieuwe ${sold.positie}.`);
        return { lineup: nextLineup, bench: nextBench };
      }

      const benchIndex = nextBench.findIndex((player) => player.id === playerId);
      if (benchIndex >= 0) {
        const sold = nextBench[benchIndex];
        nextBench[benchIndex] = createOpenSlot(sold.positie);
        setPendingSellId(playerId);
        setPendingBuyId(null);
        setTransferMessage(`${sold.naam} is verkocht. Kies nu een nieuwe ${sold.positie}.`);
        return { lineup: nextLineup, bench: nextBench };
      }

      setTransferMessage("Verkoopspeler niet gevonden.");
      return previous;
    });
  }

  function handlePickIncoming(player: EnhancedPlayer) {
    if (openSlots.length === 0) {
      setTransferMessage("Verkoop eerst een speler voordat je een vervanger kiest.");
      return;
    }

    const alreadyInSquad = squadPlayers.some((squadPlayer) => squadPlayer.id === player.id);
    if (alreadyInSquad) {
      setTransferMessage("Deze speler zit al in je team.");
      return;
    }

    setState((previous) => {
      const nextLineup = [...previous.lineup];
      const nextBench = [...previous.bench];

      const lineupIndex = nextLineup.findIndex(
        (slot) => slot.id.startsWith("open-") && slot.positie === player.positie,
      );
      if (lineupIndex >= 0) {
        nextLineup[lineupIndex] = player;
      } else {
        const benchIndex = nextBench.findIndex(
          (slot) => slot.id.startsWith("open-") && slot.positie === player.positie,
        );

        if (benchIndex >= 0) {
          nextBench[benchIndex] = player;
        } else {
          setTransferMessage("deze speler past niet in de gekozen formatie");
          return previous;
        }
      }

      const candidate = { lineup: nextLineup, bench: nextBench };
      if (!isWithinBudget([...candidate.lineup, ...candidate.bench], MAX_TRANSFER_BUDGET_MILLIONS)) {
        setTransferMessage(`Transfer geblokkeerd: team mag maximaal € ${MAX_TRANSFER_BUDGET_MILLIONS.toFixed(1)}M kosten.`);
        return previous;
      }

      const stillOpen = countOpenSlots(candidate);
      if (stillOpen === 0) {
        setPendingSellId(null);
        setPendingBuyId(null);
      }

      setTransferMessage("Transfer verwerkt: vervanger direct geplaatst.");
      return candidate;
    });
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
                        className={[
                          pendingSellId === player.id ? "player-card--sell" : "",
                          player.id.startsWith("open-") ? "player-card--open" : "",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined}
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
            <StatTile label="Resterend Budget" value={`€ ${remainingBudget.toFixed(1)}M`} />
            <StatTile label="Transfers deze ronde" value="1" />
            <StatTile label="Deadline Volgende Ronde" value="2 dagen, 4 uur" />
          </div>
          <p className="muted-note">Budget cap: € {MAX_TRANSFER_BUDGET_MILLIONS.toFixed(1)}M · Huidige teamwaarde: € {squadCost.toFixed(1)}M.</p>
        </section>

        <section className="card col-4">
          <h2>Wisselspelers</h2>
          <p className="muted-note">Maximaal {BENCH_LIMIT} wissels zichtbaar. Drag & drop respecteert positie-slots.</p>
          <div className="bench-grid">
            {state.bench.slice(0, BENCH_LIMIT).map((player, benchIndex) => (
              <PlayerCard
                key={`bench-${benchIndex}-${player.id}`}
                data-testid={`bench-card-${benchIndex}`}
                draggable={!player.id.startsWith("open-")}
                position={player.positie}
                club={player.club}
                name={player.naam}
                pointsLabel={`${player.punten} PN`}
                className={[
                  pendingSellId === player.id ? "player-card--sell" : "",
                  player.id.startsWith("open-") ? "player-card--open" : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined}
                onDragStart={onDragStart("bench", benchIndex)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop("bench", benchIndex)}
              />
            ))}
          </div>
        </section>

        <section className="card col-12" id="transfermarkt">
          <h2>Transfermarkt (onder teamoverzicht)</h2>
          <p className="muted-note">Flow: 1) verkoop speler, 2) placeholder verschijnt, 3) optioneel formatie wisselen, 4) koop vervanger op open positie.</p>

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
                value={selectedPosition}
                onChange={(event) => setSelectedPosition(event.target.value)}
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
                        disabled={openSlots.length === 0}
                        data-testid={`transfer-pick-${index}`}
                      >
                        Koop
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

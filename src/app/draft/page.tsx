"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getDraftPlayerDisplayMeta } from "@/lib/draft-player-display";
import { buildFormationSlots, getFormationOptions } from "@/domain/formation";
import { PlayerCard } from "@/components/player-card";
import { getTransferBudgetCapMillions } from "@/domain/team-budget";

type PlayerRecord = {
  id: string;
  naam: string;
  positie: "GK" | "DEF" | "MID" | "FWD";
  club: string;
  prijs: number;
};

type DraftPick = {
  pickNumber: number;
  teamId: string;
  playerId: string;
  pickedAt: string;
};

type DraftState = {
  leagueId: string;
  status: "IDLE" | "ACTIVE" | "COMPLETED";
  teamOrder: string[];
  totalRounds: number;
  totalPicks: number;
  pickSequence: string[];
  picks: DraftPick[];
  currentTurnTeamId: string | null;
};

type TeamRostersByTeamId = Record<string, string[]>;

type LeagueParticipant = {
  managerId: string;
  label: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
};

type LeagueAdminConfig = {
  competition: { name: string };
  draft: { totalRounds: number; mode?: "admin" | "manager" };
  budget?: { teamValueCapMillions: number };
  participants: LeagueParticipant[];
};

type Profile = {
  name: string;
  email: string;
  teamName: string;
  role?: "admin" | "manager";
};

const DEFAULT_ROUNDS = 15;
type DraftSortField = "naam" | "positie" | "club" | "prijs";
type DraftSortDirection = "asc" | "desc";
const POSITION_SORT_ORDER: Record<PlayerRecord["positie"], number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function getPlayerLabel(player?: PlayerRecord) {
  if (!player) return "Onbekende speler";
  return `${player.naam} · ${player.positie} · ${player.club} · €${player.prijs.toFixed(1)}M`;
}

function computeTeamAutoLineup(
  playerIds: string[],
  playerCatalog: PlayerRecord[],
): { formation: string; lineup: string[]; bench: string[] } {
  const playersById = new Map(playerCatalog.map((p) => [p.id, p]));
  const byPos: Record<string, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const pid of playerIds) {
    const pos = playersById.get(pid)?.positie;
    if (pos && byPos[pos]) byPos[pos].push(pid);
  }

  const options = getFormationOptions();
  let bestFormation = options[0];
  let bestFit = -1;

  for (const formation of options) {
    const slotCounts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const slot of buildFormationSlots(formation).flat()) {
      slotCounts[slot] += 1;
    }
    const fit = Object.keys(slotCounts).reduce(
      (sum, pos) => sum + Math.min(slotCounts[pos], (byPos[pos]?.length ?? 0)),
      0,
    );
    if (fit > bestFit) {
      bestFormation = formation;
      bestFit = fit;
    }
  }

  const used = new Set<string>();
  const lineup: string[] = [];
  for (const position of buildFormationSlots(bestFormation).flat()) {
    const next = byPos[position]?.find((id) => !used.has(id));
    if (next) {
      used.add(next);
      lineup.push(next);
    }
  }
  const bench = playerIds.filter((id) => !used.has(id));
  return { formation: bestFormation, lineup, bench };
}

export default function DraftPage() {
  const pathname = usePathname();
  const isWkMode = pathname.startsWith("/manager/world-cup");
  const modeParam = isWkMode ? "wk" : "eredivisie";
  const clubLabel = isWkMode ? "Land" : "Club";
  const clubsLabel = isWkMode ? "landen" : "clubs";
  const searchLabel = isWkMode ? "Zoek speler/land" : "Zoek speler/club";
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [teamRosters, setTeamRosters] = useState<TeamRostersByTeamId>({});
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [leagueConfig, setLeagueConfig] = useState<LeagueAdminConfig | null>(null);

  const [leagueId, setLeagueId] = useState(isWkMode ? "WK 2026" : "Eredivisie 2025/2026");
  const [teamOrderSlots, setTeamOrderSlots] = useState<string[]>([]);
  const [totalRounds, setTotalRounds] = useState(DEFAULT_ROUNDS);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<"ALL" | PlayerRecord["positie"]>("ALL");
  const [clubFilter, setClubFilter] = useState("ALL");
  const [maxPrice, setMaxPrice] = useState(0);
  const [sortField, setSortField] = useState<DraftSortField>("prijs");
  const [sortDirection, setSortDirection] = useState<DraftSortDirection>("desc");
  const [pickPlayerId, setPickPlayerId] = useState("");
  const [prePickPlayerId, setPrePickPlayerId] = useState("");
  const wasMyTurnRef = useRef(false);
  const autoPickFiredRef = useRef(false);
  const [returnTeamId, setReturnTeamId] = useState("");
  const [returnPlayerId, setReturnPlayerId] = useState("");
  const [formation, setFormation] = useState("4-3-3");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  const loadDraft = useCallback(async () => {
    const response = await fetch(`/api/draft?mode=${modeParam}&_t=${Date.now()}`, { cache: "no-store" });
    const data = (await response.json()) as { error?: string; draft?: DraftState; teamRosters?: TeamRostersByTeamId };
    if (!response.ok) {
      throw new Error(data.error ?? "Draft laden mislukt");
    }
    setDraft(data.draft ?? null);
    setTeamRosters(data.teamRosters ?? {});
  }, [modeParam]);

  const loadPlayers = useCallback(async () => {
    const response = await fetch(`/api/players?mode=${modeParam}&_t=${Date.now()}`, { cache: "no-store" });
    const data = (await response.json()) as { players?: PlayerRecord[] };
    setPlayers(Array.isArray(data.players) ? data.players : []);
  }, [modeParam]);

  async function loadProfile() {
    const response = await fetch("/api/auth/profile", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { profile?: Profile; role?: "admin" | "manager" };
    setProfile(data.profile ? { ...data.profile, role: data.role } : null);
  }

  const loadLeagueConfig = useCallback(async () => {
    const response = await fetch(`/api/admin/league-config?mode=${modeParam}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { config?: LeagueAdminConfig };
    if (!data.config) return;

    const acceptedParticipants = data.config.participants
      .filter((participant) => participant.status === "ACCEPTED");

    setLeagueConfig(data.config);
    setLeagueId(data.config.competition.name || (isWkMode ? "WK 2026" : "Eredivisie 2025/2026"));
    setTotalRounds(data.config.draft.totalRounds || DEFAULT_ROUNDS);
    if (acceptedParticipants.length >= 2 && teamOrderSlots.length === 0) {
      setTeamOrderSlots(acceptedParticipants.map((p) => p.managerId));
    }
  }, [isWkMode, modeParam]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadDraft(), loadPlayers(), loadProfile(), loadLeagueConfig()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, [loadDraft, loadPlayers, loadLeagueConfig]);

  useEffect(() => {
    void bootstrap();
    const timer = window.setInterval(() => void loadDraft().catch(() => undefined), 6000);
    return () => window.clearInterval(timer);
  }, [bootstrap, loadDraft]);

  useEffect(() => {
    if (leagueConfig) return;
    setLeagueId(isWkMode ? "WK 2026" : "Eredivisie 2025/2026");
    setSearch("");
    setPositionFilter("ALL");
    setClubFilter("ALL");
    setPickPlayerId("");
  }, [isWkMode, leagueConfig]);

  // Reset paginering bij filter- of sortwijzigingen
  useEffect(() => {
    setPage(1);
  }, [search, positionFilter, clubFilter, maxPrice, sortField, sortDirection]);

  // Reset auto-pick ref bij mode switch
  useEffect(() => {
    autoPickFiredRef.current = false;
    wasMyTurnRef.current = false;
  }, [isWkMode]);

  const acceptedParticipants = useMemo(
    () => (leagueConfig?.participants ?? []).filter((p) => p.status === "ACCEPTED"),
    [leagueConfig?.participants],
  );

  const participantById = useMemo(
    () => new Map(acceptedParticipants.map((p) => [p.managerId, p])),
    [acceptedParticipants],
  );

  const teamOrderLabels = useMemo(
    () => teamOrderSlots.map((id) => participantById.get(id)?.label ?? id).filter(Boolean),
    [teamOrderSlots, participantById],
  );

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const pickedPlayerIds = useMemo(() => new Set((draft?.picks ?? []).map((pick) => pick.playerId)), [draft?.picks]);
  const availableClubs = useMemo(() => Array.from(new Set(players.map((player) => player.club))).sort(), [players]);
  const maxAvailablePrice = useMemo(() => Math.max(0, ...players.map((player) => player.prijs)), [players]);

  useEffect(() => {
    setMaxPrice((current) => {
      if (maxAvailablePrice === 0) return 0;
      if (current <= 0 || current > maxAvailablePrice) return maxAvailablePrice;
      return current;
    });
  }, [maxAvailablePrice]);

  const myDraftTeamId = useMemo(() => {
    if (!draft || !profile) return null;
    const candidates = [profile.name, profile.teamName, profile.email].map(normalize);
    const directMatch = draft.teamOrder.find((team) => candidates.includes(normalize(team)));
    if (directMatch) return directMatch;
    // Match via participant email — find the participant with matching email,
    // then check both label and managerId (teamOrder can contain either)
    const participant = acceptedParticipants.find(
      (p) => normalize(p.email) === normalize(profile.email),
    );
    if (participant) {
      if (draft.teamOrder.includes(participant.label)) return participant.label;
      if (draft.teamOrder.includes(participant.managerId)) return participant.managerId;
    }
    return null;
  }, [draft, profile, acceptedParticipants]);

  const activeTeamId = draft?.currentTurnTeamId ?? "";
  const myRoster = myDraftTeamId ? (teamRosters[myDraftTeamId] ?? []) : [];
  const isMyTurn = Boolean(myDraftTeamId && draft?.currentTurnTeamId === myDraftTeamId);
  const pickNumber = (draft?.picks.length ?? 0) + 1;
  const currentRound = draft && draft.teamOrder.length > 0 ? Math.ceil(pickNumber / draft.teamOrder.length) : 0;

  // Auto-pick pre-selectie wanneer beurt wisselt naar mij
  useEffect(() => {
    const wasMyTurn = wasMyTurnRef.current;
    wasMyTurnRef.current = isMyTurn;

    if (!isMyTurn || wasMyTurn || autoPickFiredRef.current) return;
    if (!prePickPlayerId || !myDraftTeamId) return;

    const prePickPlayer = playerById.get(prePickPlayerId);
    if (!prePickPlayer || pickedPlayerIds.has(prePickPlayerId)) {
      setPrePickPlayerId("");
      setError(`${prePickPlayer?.naam ?? prePickPlayerId} is niet meer beschikbaar. Kies een andere speler.`);
      return;
    }

    autoPickFiredRef.current = true;
    void postDraftAction(
      { action: "pick", teamId: myDraftTeamId, playerId: prePickPlayerId },
      `Auto-pick: ${prePickPlayer.naam}`,
    ).then(() => {
      setPrePickPlayerId("");
      autoPickFiredRef.current = false;
    });
  }, [isMyTurn, prePickPlayerId, myDraftTeamId, playerById, pickedPlayerIds]);

  const formationSlots = useMemo(() => {
    const slots = buildFormationSlots(formation);
    const byPos: Record<string, PlayerRecord[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const pid of myRoster) {
      const player = playerById.get(pid);
      if (player) byPos[player.positie].push(player);
    }
    const remaining = { ...byPos };
    return slots.map((row) =>
      row.map((pos) => {
        const pool = remaining[pos] ?? [];
        return pool.length > 0 ? pool.shift()! : null;
      }),
    );
  }, [formation, myRoster, playerById]);

  const teamAutoLineups = useMemo(() => {
    const result: Record<string, { formation: string; lineup: string[]; bench: string[] }> = {};
    for (const [teamId, roster] of Object.entries(teamRosters)) {
      result[teamId] = computeTeamAutoLineup(roster, players);
    }
    return result;
  }, [teamRosters, players]);

  const filteredPlayers = useMemo(() => {
    const q = normalize(search);
    return players
      .filter((player) => !pickedPlayerIds.has(player.id))
      .filter((player) => positionFilter === "ALL" || player.positie === positionFilter)
      .filter((player) => clubFilter === "ALL" || player.club === clubFilter)
      .filter((player) => maxPrice <= 0 || player.prijs <= maxPrice)
      .filter((player) => !q || normalize(`${player.naam} ${player.club} ${player.positie}`).includes(q))
      .sort((left, right) => {
        let result = 0;
        if (sortField === "naam") {
          result = left.naam.localeCompare(right.naam, "nl", { sensitivity: "base" });
        } else if (sortField === "club") {
          result = left.club.localeCompare(right.club, "nl", { sensitivity: "base" });
        } else if (sortField === "positie") {
          result = POSITION_SORT_ORDER[left.positie] - POSITION_SORT_ORDER[right.positie];
        } else {
          result = left.prijs - right.prijs;
        }
        if (result === 0) result = left.naam.localeCompare(right.naam, "nl", { sensitivity: "base" });
        return sortDirection === "asc" ? result : -result;
      });
  }, [players, pickedPlayerIds, positionFilter, clubFilter, maxPrice, search, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / PAGE_SIZE));
  const paginatedPlayers = useMemo(
    () => filteredPlayers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredPlayers, page],
  );

  // Reset page bij filterwijzigingen
  const safePage = Math.min(page, totalPages);

  function toggleSort(field: DraftSortField) {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection(field === "prijs" ? "desc" : "asc");
  }

  function sortIndicator(field: DraftSortField) {
    if (sortField !== field) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  }

  const pickedRows = useMemo(
    () =>
      (draft?.picks ?? []).map((pick) => ({
        ...pick,
        player: playerById.get(pick.playerId),
      })),
    [draft?.picks, playerById],
  );

  async function postDraftAction(payload: Record<string, unknown>, okMessage: string) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/draft?mode=${modeParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string; draft?: DraftState; teamRosters?: TeamRostersByTeamId };
      if (!response.ok) {
        throw new Error(data.error ?? "Draft actie mislukt");
      }
      setDraft(data.draft ?? null);
      setTeamRosters(data.teamRosters ?? {});
      setPickPlayerId("");
      setSuccess(okMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setBusy(false);
    }
  }

  const canPick = draft?.status === "ACTIVE" && Boolean(activeTeamId && pickPlayerId) && !busy;
  const isManagerMode = leagueConfig?.draft?.mode === "manager";
  const isAdmin = profile?.role === "admin";
  // In admin mode: only admins can pick (for any team)
  // In manager mode: only the team's manager can pick (for their own team)
  const canPickInMode = isManagerMode
    ? (canPick && isMyTurn)
    : (canPick && isAdmin);

  return (
    <AppShell
      title={leagueConfig?.competition.name || (isWkMode ? "WK Draftkamer" : "Eredivisie Draftkamer")}
      subtitle={
        isWkMode
          ? "WK draft-interface met eigen spelerspool, land/waarde/naam/positie-filters, live beurt, teamrosters en pick-historie."
          : "Eredivisie draft-interface met live beurt, spelerspool, teamrosters en pick-historie."
      }
    >
      <div className="draft-room">
        <section className={`draft-hero ${isMyTurn ? "my-turn" : ""}`}>
          <div>
            <p className="draft-eyebrow">{draft?.status === "ACTIVE" ? `Pick ${pickNumber} · Ronde ${currentRound}` : "Draft voorbereiding"}</p>
            <h2>
              {draft?.status === "ACTIVE"
                ? `${activeTeamId} is aan de beurt`
                : draft?.status === "COMPLETED"
                  ? "Draft afgerond"
                  : "Nog geen actieve draft"}
            </h2>
            <p>
              {isMyTurn
                ? "Jij bent aan de beurt, bro. Kies hieronder je speler."
                : myDraftTeamId
                  ? `Jij draft als ${myDraftTeamId}. Wacht tot jouw beurt groen/oranje oplicht.`
                  : "Je bent ingelogd, maar je naam/teamnaam staat nog niet in de draftvolgorde."}
            </p>
            {isManagerMode ? <p className="draft-eyebrow" style={{ marginTop: 4 }}>🔒 Manager modus — jij kiest alleen voor je eigen team</p> : null}
          </div>
          <div className="draft-hero-stats">
            <span>Status</span>
            <strong>{draft?.status ?? "LADEN"}</strong>
            <span>Picks</span>
            <strong>
              {draft?.picks.length ?? 0}/{draft?.totalPicks ?? 0}
            </strong>
          </div>
        </section>

        {loading ? <p className="draft-message">Draft laden...</p> : null}

        {!loading && draft?.status !== "ACTIVE" && draft?.status !== "COMPLETED" ? (
          <section className="card col-12" style={{ textAlign: "center", padding: "2rem" }}>
            <h2 style={{ marginBottom: "0.5rem", color: "var(--muted)" }}>
              {isWkMode ? "🌍 Geen actieve WK-draft" : "⚽ Geen actieve Eredivisie-draft"}
            </h2>
            <p style={{ color: "var(--muted)", maxWidth: 480, margin: "0 auto" }}>
              {isAdmin
                ? "Start een oefendraft via de admin-controls hieronder om te beginnen."
                : "De league-admin moet eerst een draft starten. Je kunt alvast de spelerslijst bekijken."}
            </p>
          </section>
        ) : null}

        <section className="card col-12 draft-order-card">
          <div className="section-title-row">
            <div>
              <h2>Volgorde van kiezen</h2>
              <p>Patroon: ronde 1 vooruit, ronde 2 vooruit, ronde 3 omgekeerd. Daarna herhalen we dat blok.</p>
            </div>
          </div>
          {(draft?.teamOrder.length ?? 0) > 0 ? (
            <div className="draft-order-track">
              {draft?.teamOrder.map((team, index) => (
                <article key={team} className={`draft-order-chip ${team === activeTeamId ? "active" : ""} ${team === myDraftTeamId ? "mine" : ""}`}>
                  <span>{index + 1}</span>
                  <strong>{team}</strong>
                </article>
              ))}
            </div>
          ) : (
            <p>Start hieronder een oefendraft om de volgorde zichtbaar te maken.</p>
          )}
        </section>

        <section className="card col-12 draft-pick-panel">
          <div className="section-title-row">
            <div>
              <h2>Speler kiezen</h2>
              <p>{activeTeamId ? `Deze pick gaat naar ${activeTeamId}.` : "Start eerst een draft."}</p>
            </div>
            <div className="draft-filter-row compact">
              <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value as typeof positionFilter)} aria-label="Filter op positie">
                <option value="ALL">Alle posities</option>
                <option value="GK">Keeper</option>
                <option value="DEF">Verdediger</option>
                <option value="MID">Middenveld</option>
                <option value="FWD">Aanvaller</option>
              </select>
              <select value={clubFilter} onChange={(event) => setClubFilter(event.target.value)} aria-label={`Filter op ${clubLabel.toLowerCase()}`}>
                <option value="ALL">Alle {clubsLabel}</option>
                {availableClubs.map((club) => (
                  <option key={club} value={club}>
                    {club}
                  </option>
                ))}
              </select>
              <input placeholder={searchLabel} value={search} onChange={(event) => setSearch(event.target.value)} aria-label={searchLabel} />
              <label className="draft-price-filter">
                Waarde t/m € {maxPrice.toFixed(2)}M
                <input
                  type="range"
                  min={0}
                  max={maxAvailablePrice || 0}
                  step={0.1}
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(Number(event.target.value))}
                  aria-label="Filter op maximale transferwaarde"
                />
              </label>
            </div>
          </div>

          <div className="draft-result-row">
            <p className="muted-note">Resultaten: {filteredPlayers.length} • Pagina {safePage}/{totalPages} ({paginatedPlayers.length} getoond)</p>
            <div className="draft-sort-actions" aria-label="Draft sortering">
              <button type="button" onClick={() => toggleSort("naam")}>Naam {sortIndicator("naam")}</button>
              <button type="button" onClick={() => toggleSort("positie")}>Positie {sortIndicator("positie")}</button>
              <button type="button" onClick={() => toggleSort("club")}>{clubLabel} {sortIndicator("club")}</button>
              <button type="button" onClick={() => toggleSort("prijs")}>Waarde {sortIndicator("prijs")}</button>
            </div>
          </div>

          {myDraftTeamId ? (
            <div style={{ marginBottom: 12 }}>
              <div className="formation-header">
                <strong style={{ fontSize: "0.9rem" }}>{myDraftTeamId} · {myRoster.length} spelers</strong>
                <select className="formation-select" value={formation} onChange={(e) => setFormation(e.target.value)} aria-label="Formatie">
                  {getFormationOptions().map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="pitch">
                {formationSlots.map((row, ri) => (
                  <div key={ri} className="pitch-row" data-size={row.length}>
                    {row.map((player, ci) => {
                      if (player) {
                        return (
                          <PlayerCard
                            key={player.id}
                            position={player.positie}
                            club={player.club}
                            name={player.naam}
                            pointsLabel={`€${player.prijs.toFixed(1)}M`}
                          />
                        );
                      }
                      const posLabel = row.length === 1 ? "GK" : ri === 1 ? "DEF" : ri === 2 ? "MID" : "FWD";
                      return (
                        <PlayerCard
                          key={`open-${ri}-${ci}`}
                          position={posLabel}
                          club="—"
                          name="Open"
                          pointsLabel="—"
                          className="player-card--open"
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="draft-player-grid">
            {paginatedPlayers.map((player) => {
              const display = getDraftPlayerDisplayMeta(player);
              return (
                <button
                  type="button"
                  key={player.id}
                  className={`draft-player-card ${pickPlayerId === player.id ? "selected" : ""} ${prePickPlayerId === player.id ? "pre-selected" : ""}`}
                  onClick={() => {
                    if (isMyTurn) {
                      setPickPlayerId(player.id);
                      setPrePickPlayerId("");
                    } else if (myDraftTeamId) {
                      setPrePickPlayerId(player.id);
                      setPickPlayerId("");
                    }
                  }}
                  disabled={draft?.status !== "ACTIVE" || busy}
                >
                  {display.flagImageUrl ? (
                    <span
                      className="draft-country-flag"
                      role="img"
                      aria-label={display.flagAlt}
                      style={{ backgroundImage: `url(${display.flagImageUrl})` }}
                    />
                  ) : null}
                  <span className="draft-player-meta">{display.meta}</span>
                  <strong>{display.name}</strong>
                  <span>{display.priceLabel}</span>
                </button>
              );
            })}
          </div>

          {totalPages > 1 ? (
            <div className="draft-pagination">
              <button
                type="button"
                disabled={page <= 1 || busy}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Vorige
              </button>
              <span>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const pageNum = start + i;
                  if (pageNum > totalPages) return null;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      className={pageNum === page ? "active" : ""}
                      disabled={busy}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || busy}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Volgende →
              </button>
            </div>
          ) : null}

          {myDraftTeamId && !isMyTurn ? (
            <div className="draft-confirm-bar draft-pre-pick-bar">
              <div>
                <span>Pre-selectie voor {myDraftTeamId}</span>
                {prePickPlayerId ? (
                  <>
                    <strong>{getPlayerLabel(playerById.get(prePickPlayerId))}</strong>
                    <span className="muted-note" style={{ fontSize: "0.8rem" }}>
                      Wordt automatisch gekozen zodra jij aan de beurt bent.
                      <button
                        type="button"
                        onClick={() => setPrePickPlayerId("")}
                        style={{ marginLeft: 8, fontSize: "0.78rem", padding: "2px 8px" }}
                      >
                        Annuleren
                      </button>
                    </span>
                  </>
                ) : (
                  <span className="muted-note" style={{ fontSize: "0.8rem" }}>
                    Klik op een speler om hem vast te zetten voor je volgende beurt.
                  </span>
                )}
              </div>
            </div>
          ) : null}

          <div className="draft-confirm-bar">
            <div>
              <span>Geselecteerd</span>
              <strong>{pickPlayerId ? getPlayerLabel(playerById.get(pickPlayerId)) : "Nog niemand"}</strong>
            </div>
            <button
              type="button"
              disabled={!canPickInMode}
              onClick={() => void postDraftAction({ action: "pick", teamId: activeTeamId, playerId: pickPlayerId }, "Pick opgeslagen")}
            >
              Bevestig pick voor {activeTeamId || "team"}
            </button>
          </div>
          {error ? <p className="error-text" style={{ marginTop: 8, textAlign: "center" }}>{error}</p> : null}
          {success ? <p className="success-text" style={{ marginTop: 8, textAlign: "center" }}>{success}</p> : null}
        </section>

        <section className="card col-12">
          <div className="section-title-row">
            <div>
              <h2>Mijn selectie</h2>
              <p>{myDraftTeamId ? `${myDraftTeamId} heeft ${myRoster.length} spelers.` : "Koppel je naam via Account of gebruik een teamnaam uit de draftvolgorde."}</p>
              {myDraftTeamId ? (
                <p className="muted-note" style={{ marginTop: 4 }}>
                  Budget: €
                  {myRoster.reduce((sum, pid) => sum + (playerById.get(pid)?.prijs ?? 0), 0).toFixed(1)}M
                  gebruikt
                  {" · "}
                  €
                  {Math.max(0, (leagueConfig?.budget?.teamValueCapMillions ?? 100) - myRoster.reduce((sum, pid) => sum + (playerById.get(pid)?.prijs ?? 0), 0)).toFixed(1)}M
                  over
                </p>
              ) : null}
            </div>
          </div>
          <div className="draft-roster-list">
            {myRoster.length === 0 ? <p>Nog geen spelers in jouw selectie.</p> : null}
            {myRoster.map((playerId) => {
              const player = playerById.get(playerId);
              return (
                <article key={playerId} className="draft-roster-pill">
                  <strong>{player?.naam ?? playerId}</strong>
                  <span>{player ? `${player.positie} · ${player.club}` : playerId}</span>
                </article>
              );
            })}
          </div>
        </section>

        <section className="card col-12">
          <h2>Alle teams</h2>
          <div className="draft-team-grid">
            {(draft?.teamOrder ?? []).map((teamId) => {
              const roster = teamRosters[teamId] ?? [];
              const autoLineup = teamAutoLineups[teamId];
              const lineup = autoLineup?.lineup ?? roster.slice(0, 11);
              const bench = autoLineup?.bench ?? roster.slice(11);
              const formation = autoLineup?.formation ?? "";
              const spent = roster.reduce((sum, pid) => sum + (playerById.get(pid)?.prijs ?? 0), 0);
              const budgetCap = leagueConfig?.budget?.teamValueCapMillions ?? getTransferBudgetCapMillions(isWkMode ? "wk" : "eredivisie");
              const remaining = Math.max(0, budgetCap - spent);
              return (
                <article key={teamId} className={`draft-team-card ${teamId === activeTeamId ? "active" : ""}`}>
                  <h3>{teamId}</h3>
                  <p>{roster.length} spelers{formation ? ` · ${formation}` : ""}</p>
                  <p className="draft-team-budget">
                    €{spent.toFixed(1)}M gebruikt · €{remaining.toFixed(1)}M over
                  </p>
                  {lineup.length > 0 ? (
                    <div className="draft-team-lineup">
                      <span className="draft-team-subheader">Basis ({lineup.length})</span>
                      <ul>
                        {lineup.map((playerId) => {
                          const player = playerById.get(playerId);
                          return <li key={`${teamId}-${playerId}`}>{player?.naam ?? playerId}</li>;
                        })}
                      </ul>
                    </div>
                  ) : null}
                  {bench.length > 0 ? (
                    <div className="draft-team-bench">
                      <span className="draft-team-subheader">Bank ({bench.length})</span>
                      <ul>
                        {bench.map((playerId) => {
                          const player = playerById.get(playerId);
                          return <li key={`${teamId}-${playerId}`}>{player?.naam ?? playerId}</li>;
                        })}
                      </ul>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        {isAdmin ? (
        <section className="card col-12 draft-admin-details">
          <div className="section-title-row">
            <div>
              <h2>Oefendraft beheren</h2>
              <p>
                Start/reset de draft vanuit de admin-config. Competitienaam, rondes en geaccepteerde deelnemers komen uit Instellingen.
              </p>
            </div>
            <a className="ghost-button" href="/instellingen">Competitie configureren</a>
          </div>
          <div className="draft-admin-grid">
            <label>
              League ID
              <input value={leagueId} onChange={(event) => setLeagueId(event.target.value)} disabled={busy} />
            </label>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ marginBottom: 8, display: "block", fontWeight: 600 }}>Teams in volgorde</label>
              {teamOrderSlots.map((managerId, index) => {
                const available = acceptedParticipants.filter(
                  (p) => !teamOrderSlots.includes(p.managerId) || p.managerId === managerId,
                );
                return (
                  <div key={index} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                    <span style={{ minWidth: 24, color: "#666", fontSize: 13 }}>{index + 1}.</span>
                    <select
                      value={managerId}
                      onChange={(event) => {
                        const next = [...teamOrderSlots];
                        next[index] = event.target.value;
                        setTeamOrderSlots(next);
                      }}
                      disabled={busy}
                      style={{ flex: 1 }}
                    >
                      <option value="">— Kies manager —</option>
                      {available.map((p) => (
                        <option key={p.managerId} value={p.managerId}>
                          {p.label} ({p.email})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setTeamOrderSlots(teamOrderSlots.filter((_, i) => i !== index))}
                      disabled={busy || teamOrderSlots.length <= 2}
                      style={{ padding: "4px 8px", fontSize: 12 }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setTeamOrderSlots([...teamOrderSlots, ""])}
                disabled={busy || teamOrderSlots.length >= acceptedParticipants.length}
                style={{ marginTop: 4, padding: "4px 12px", fontSize: 12 }}
              >
                + Voeg positie toe
              </button>
            </div>
            <label>
              Rondes
              <input type="number" min={1} value={totalRounds} onChange={(event) => setTotalRounds(Number(event.target.value || 1))} disabled={busy} />
            </label>
            <button
              type="button"
              disabled={busy || teamOrderSlots.filter(Boolean).length < 2 || totalRounds < 1}
              onClick={() =>
                void postDraftAction(
                  { action: "start", leagueId, teamOrder: teamOrderLabels, totalRounds, startedBy: profile?.email ?? "draft-ui" },
                  "Oefendraft gestart",
                )
              }
            >
              Start / reset oefendraft
            </button>
          </div>

          <div className="draft-admin-grid">
            <label>
              Return team
              <select value={returnTeamId} onChange={(event) => setReturnTeamId(event.target.value)} disabled={busy}>
                <option value="">Kies team</option>
                {(draft?.teamOrder ?? []).map((team) => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </label>
            <label>
              Return speler
              <select value={returnPlayerId} onChange={(event) => setReturnPlayerId(event.target.value)} disabled={busy || !returnTeamId}>
                <option value="">Kies speler</option>
                {(returnTeamId ? teamRosters[returnTeamId] ?? [] : []).map((playerId) => (
                  <option key={playerId} value={playerId}>{playerById.get(playerId)?.naam ?? playerId}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !returnTeamId || !returnPlayerId}
              onClick={() => void postDraftAction({ action: "return", teamId: returnTeamId, playerId: returnPlayerId, reason: "manual return ui" }, "Speler teruggezet naar pool")}
            >
              Speler terugzetten
            </button>
          </div>
        </section>
        ) : null}

        <section className="card col-12">
          <h2>Pick historie</h2>
          {pickedRows.length === 0 ? <p>Nog geen picks.</p> : null}
          <ol className="draft-history-list">
            {pickedRows.map((pick) => (
              <li key={`${pick.pickNumber}-${pick.playerId}-${pick.teamId}`}>
                <span>#{pick.pickNumber}</span>
                <strong>{pick.teamId}</strong>
                <em>{getPlayerLabel(pick.player)}</em>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}

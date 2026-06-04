"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";

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

type Profile = {
  name: string;
  email: string;
  teamName: string;
};

const DEFAULT_TEAMS = "Johan Swart,Thomas,Jack,Emiel Zomerdijk";
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

  const [leagueId, setLeagueId] = useState(isWkMode ? "wk-2026" : "eredivisie-2025-2026");
  const [teamCsv, setTeamCsv] = useState(DEFAULT_TEAMS);
  const [totalRounds, setTotalRounds] = useState(DEFAULT_ROUNDS);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<"ALL" | PlayerRecord["positie"]>("ALL");
  const [clubFilter, setClubFilter] = useState("ALL");
  const [maxPrice, setMaxPrice] = useState(0);
  const [sortField, setSortField] = useState<DraftSortField>("prijs");
  const [sortDirection, setSortDirection] = useState<DraftSortDirection>("desc");
  const [pickPlayerId, setPickPlayerId] = useState("");
  const [returnTeamId, setReturnTeamId] = useState("");
  const [returnPlayerId, setReturnPlayerId] = useState("");

  const loadDraft = useCallback(async () => {
    const response = await fetch(`/api/draft?mode=${modeParam}`, { cache: "no-store" });
    const data = (await response.json()) as { error?: string; draft?: DraftState; teamRosters?: TeamRostersByTeamId };
    if (!response.ok) {
      throw new Error(data.error ?? "Draft laden mislukt");
    }
    setDraft(data.draft ?? null);
    setTeamRosters(data.teamRosters ?? {});
  }, [modeParam]);

  const loadPlayers = useCallback(async () => {
    const response = await fetch(`/api/players?mode=${modeParam}`, { cache: "no-store" });
    const data = (await response.json()) as { players?: PlayerRecord[] };
    setPlayers(Array.isArray(data.players) ? data.players : []);
  }, [modeParam]);

  async function loadProfile() {
    const response = await fetch("/api/auth/profile", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { profile?: Profile };
    setProfile(data.profile ?? null);
  }

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadDraft(), loadPlayers(), loadProfile()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, [loadDraft, loadPlayers]);

  useEffect(() => {
    void bootstrap();
    const timer = window.setInterval(() => void loadDraft().catch(() => undefined), 6000);
    return () => window.clearInterval(timer);
  }, [bootstrap, loadDraft]);

  useEffect(() => {
    setLeagueId(isWkMode ? "wk-2026" : "eredivisie-2025-2026");
    setSearch("");
    setPositionFilter("ALL");
    setClubFilter("ALL");
    setPickPlayerId("");
  }, [isWkMode]);

  const parsedTeams = useMemo(
    () =>
      teamCsv
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    [teamCsv],
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
    return draft.teamOrder.find((team) => candidates.includes(normalize(team))) ?? null;
  }, [draft, profile]);

  const activeTeamId = draft?.currentTurnTeamId ?? "";
  const myRoster = myDraftTeamId ? (teamRosters[myDraftTeamId] ?? []) : [];
  const isMyTurn = Boolean(myDraftTeamId && draft?.currentTurnTeamId === myDraftTeamId);
  const pickNumber = (draft?.picks.length ?? 0) + 1;
  const currentRound = draft && draft.teamOrder.length > 0 ? Math.ceil(pickNumber / draft.teamOrder.length) : 0;

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
      })
      .slice(0, 80);
  }, [players, pickedPlayerIds, positionFilter, clubFilter, maxPrice, search, sortField, sortDirection]);

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

  return (
    <AppShell
      title={isWkMode ? "WK Draftkamer" : "Eredivisie Draftkamer"}
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

        {error ? <p className="error-text draft-message">{error}</p> : null}
        {success ? <p className="success-text draft-message">{success}</p> : null}
        {loading ? <p className="draft-message">Draft laden...</p> : null}

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
            <p className="muted-note">Resultaten: {filteredPlayers.length} • Toon max. 80 beschikbare spelers</p>
            <div className="draft-sort-actions" aria-label="Draft sortering">
              <button type="button" onClick={() => toggleSort("naam")}>Naam {sortIndicator("naam")}</button>
              <button type="button" onClick={() => toggleSort("positie")}>Positie {sortIndicator("positie")}</button>
              <button type="button" onClick={() => toggleSort("club")}>{clubLabel} {sortIndicator("club")}</button>
              <button type="button" onClick={() => toggleSort("prijs")}>Waarde {sortIndicator("prijs")}</button>
            </div>
          </div>

          <div className="draft-player-grid">
            {filteredPlayers.map((player) => (
              <button
                type="button"
                key={player.id}
                className={`draft-player-card ${pickPlayerId === player.id ? "selected" : ""}`}
                onClick={() => setPickPlayerId(player.id)}
                disabled={draft?.status !== "ACTIVE" || busy}
              >
                <span className="draft-player-meta">{player.positie} · {player.club}</span>
                <strong>{player.naam}</strong>
                <span>€{player.prijs.toFixed(1)}M</span>
              </button>
            ))}
          </div>

          <div className="draft-confirm-bar">
            <div>
              <span>Geselecteerd</span>
              <strong>{pickPlayerId ? getPlayerLabel(playerById.get(pickPlayerId)) : "Nog niemand"}</strong>
            </div>
            <button
              type="button"
              disabled={!canPick}
              onClick={() => void postDraftAction({ action: "pick", teamId: activeTeamId, playerId: pickPlayerId }, "Pick opgeslagen")}
            >
              Bevestig pick voor {activeTeamId || "team"}
            </button>
          </div>
        </section>

        <section className="card col-12">
          <div className="section-title-row">
            <div>
              <h2>Mijn selectie</h2>
              <p>{myDraftTeamId ? `${myDraftTeamId} heeft ${myRoster.length} spelers.` : "Koppel je naam via Account of gebruik een teamnaam uit de draftvolgorde."}</p>
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
              return (
                <article key={teamId} className={`draft-team-card ${teamId === activeTeamId ? "active" : ""}`}>
                  <h3>{teamId}</h3>
                  <p>{roster.length} spelers</p>
                  <ul>
                    {roster.slice(0, 8).map((playerId) => {
                      const player = playerById.get(playerId);
                      return <li key={`${teamId}-${playerId}`}>{player?.naam ?? playerId}</li>;
                    })}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        <details className="card col-12 draft-admin-details">
          <summary>Oefendraft beheren</summary>
          <div className="draft-admin-grid">
            <label>
              League ID
              <input value={leagueId} onChange={(event) => setLeagueId(event.target.value)} disabled={busy} />
            </label>
            <label>
              Teams in volgorde
              <input value={teamCsv} onChange={(event) => setTeamCsv(event.target.value)} disabled={busy} />
            </label>
            <label>
              Rondes
              <input type="number" min={1} value={totalRounds} onChange={(event) => setTotalRounds(Number(event.target.value || 1))} disabled={busy} />
            </label>
            <button
              type="button"
              disabled={busy || parsedTeams.length < 2 || totalRounds < 1}
              onClick={() =>
                void postDraftAction(
                  { action: "start", leagueId, teamOrder: parsedTeams, totalRounds, startedBy: profile?.email ?? "draft-ui" },
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
        </details>

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

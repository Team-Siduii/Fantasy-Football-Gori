"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const DEFAULT_TEAMS = "Team A,Team B,Team C,Team D";

export default function DraftPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [teamRosters, setTeamRosters] = useState<TeamRostersByTeamId>({});
  const [players, setPlayers] = useState<PlayerRecord[]>([]);

  const [leagueId, setLeagueId] = useState("league-1");
  const [teamCsv, setTeamCsv] = useState(DEFAULT_TEAMS);
  const [totalRounds, setTotalRounds] = useState(4);

  const [pickTeamId, setPickTeamId] = useState("");
  const [pickPlayerId, setPickPlayerId] = useState("");
  const [returnTeamId, setReturnTeamId] = useState("");
  const [returnPlayerId, setReturnPlayerId] = useState("");

  async function loadDraft() {
    const response = await fetch("/api/draft", { cache: "no-store" });
    const data = (await response.json()) as { error?: string; draft?: DraftState; teamRosters?: TeamRostersByTeamId };
    if (!response.ok) {
      throw new Error(data.error ?? "Draft laden mislukt");
    }
    setDraft(data.draft ?? null);
    setTeamRosters(data.teamRosters ?? {});
  }

  async function loadPlayers() {
    const response = await fetch("/api/players", { cache: "no-store" });
    const data = (await response.json()) as { players?: PlayerRecord[] };
    setPlayers(Array.isArray(data.players) ? data.players : []);
  }

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadDraft(), loadPlayers()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (draft?.currentTurnTeamId) {
      setPickTeamId(draft.currentTurnTeamId);
    }
  }, [draft?.currentTurnTeamId]);

  const pickedPlayerIds = useMemo(() => new Set((draft?.picks ?? []).map((pick) => pick.playerId)), [draft?.picks]);

  const availablePlayers = useMemo(
    () => players.filter((player) => !pickedPlayerIds.has(player.id)).slice(0, 200),
    [players, pickedPlayerIds],
  );

  const pickedRows = useMemo(
    () =>
      (draft?.picks ?? []).map((pick) => {
        const player = players.find((entry) => entry.id === pick.playerId);
        return {
          ...pick,
          playerName: player?.naam ?? pick.playerId,
        };
      }),
    [draft?.picks, players],
  );

  async function postDraftAction(payload: Record<string, unknown>, okMessage: string) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/draft", {
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
      setSuccess(okMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setBusy(false);
    }
  }

  const parsedTeams = teamCsv
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return (
    <AppShell title="Draft" subtitle="Live draft-flow: start, pick en return op persistente draft-state.">
      <div className="grid">
        <section className="card col-6">
          <h2>Draft status</h2>
          {loading ? <p>Laden...</p> : null}
          {!loading && draft ? (
            <>
              <p>
                Status: <strong>{draft.status}</strong>
              </p>
              <p>
                Huidige beurt: <strong>{draft.currentTurnTeamId ?? "-"}</strong>
              </p>
              <p>
                Picks: <strong>{draft.picks.length}</strong> / {draft.totalPicks}
              </p>
            </>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
          {success ? <p>{success}</p> : null}
        </section>

        <section className="card col-6">
          <h2>Start draft</h2>
          <label>
            League ID
            <input value={leagueId} onChange={(event) => setLeagueId(event.target.value)} disabled={busy} />
          </label>
          <label>
            Teams (comma separated)
            <input value={teamCsv} onChange={(event) => setTeamCsv(event.target.value)} disabled={busy} />
          </label>
          <label>
            Rounds
            <input
              type="number"
              min={1}
              value={totalRounds}
              onChange={(event) => setTotalRounds(Number(event.target.value || 1))}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            disabled={busy || parsedTeams.length < 2 || totalRounds < 1}
            onClick={() =>
              void postDraftAction(
                {
                  action: "start",
                  leagueId,
                  teamOrder: parsedTeams,
                  totalRounds,
                  startedBy: "admin-ui",
                },
                "Draft gestart",
              )
            }
          >
            {busy ? "Bezig..." : "Start draft"}
          </button>
        </section>

        <section className="card col-6">
          <h2>Pick speler</h2>
          <label>
            Team
            <select value={pickTeamId} onChange={(event) => setPickTeamId(event.target.value)} disabled={busy}>
              <option value="">Kies team</option>
              {(draft?.teamOrder ?? []).map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>
          <label>
            Speler
            <select value={pickPlayerId} onChange={(event) => setPickPlayerId(event.target.value)} disabled={busy}>
              <option value="">Kies speler</option>
              {availablePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.naam} ({player.positie} - {player.club})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !pickTeamId || !pickPlayerId || draft?.status !== "ACTIVE"}
            onClick={() => void postDraftAction({ action: "pick", teamId: pickTeamId, playerId: pickPlayerId }, "Pick gelukt")}
          >
            Bevestig pick
          </button>
        </section>

        <section className="card col-6">
          <h2>Return speler naar pool</h2>
          <label>
            Team
            <select value={returnTeamId} onChange={(event) => setReturnTeamId(event.target.value)} disabled={busy}>
              <option value="">Kies team</option>
              {(draft?.teamOrder ?? []).map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>
          <label>
            Speler ID
            <input value={returnPlayerId} onChange={(event) => setReturnPlayerId(event.target.value)} disabled={busy} />
          </label>
          <button
            type="button"
            disabled={busy || !returnTeamId || !returnPlayerId}
            onClick={() =>
              void postDraftAction(
                { action: "return", teamId: returnTeamId, playerId: returnPlayerId, reason: "manual return ui" },
                "Speler teruggezet naar pool",
              )
            }
          >
            Return player
          </button>
        </section>

        <section className="card col-12">
          <h2>Team-overview (draft roster)</h2>
          {(draft?.teamOrder ?? []).length === 0 ? <p>Start eerst een draft om teamrosters te tonen.</p> : null}
          {(draft?.teamOrder ?? []).length > 0 ? (
            <div className="grid">
              {(draft?.teamOrder ?? []).map((teamId) => {
                const roster = teamRosters[teamId] ?? [];
                return (
                  <article key={teamId} className="card col-3">
                    <h3>{teamId}</h3>
                    <p>{roster.length} spelers gepickt</p>
                    {roster.length === 0 ? <p>Nog geen spelers</p> : null}
                    {roster.length > 0 ? (
                      <ul>
                        {roster.map((playerId) => {
                          const player = players.find((entry) => entry.id === playerId);
                          return <li key={`${teamId}-${playerId}`}>{player?.naam ?? playerId}</li>;
                        })}
                      </ul>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="card col-12">
          <h2>Pick historie</h2>
          {pickedRows.length === 0 ? <p>Nog geen picks.</p> : null}
          {pickedRows.length > 0 ? (
            <ol>
              {pickedRows.map((pick) => (
                <li key={`${pick.pickNumber}-${pick.playerId}-${pick.teamId}`}>
                  Pick {pick.pickNumber}: {pick.teamId} → {pick.playerName} ({pick.playerId})
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

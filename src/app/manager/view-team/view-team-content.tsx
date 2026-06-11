"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { buildFormationSlots } from "@/domain/formation";
import { getCountryFlagImageUrl } from "@/lib/country-flags";

type Position = "GK" | "DEF" | "MID" | "FWD";

type ViewPlayer = {
  id: string;
  naam: string;
  positie: string;
  club: string;
  prijs: number;
  punten: number;
};

type ViewTeamResponse = {
  isOwnTeam: boolean;
  teamName: string;
  managerName: string;
  formation: string;
  lineup: ViewPlayer[];
  bench: ViewPlayer[];
  budgetCap: number;
  budgetRemaining: number;
  squadCost: number;
  pendingSellId: string | null;
  pendingBuyId: string | null;
};

const POSITION_SORT: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

function sortByPosition(players: ViewPlayer[]): ViewPlayer[] {
  return [...players].sort((a, b) => {
    const pa = POSITION_SORT[a.positie as Position] ?? 99;
    const pb = POSITION_SORT[b.positie as Position] ?? 99;
    return pa - pb;
  });
}

export default function ViewTeamPageContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isWkMode = pathname.startsWith("/manager/world-cup");
  const modeParam = isWkMode ? "wk" : "eredivisie";
  const viewEmail = searchParams.get("view") ?? "";

  const [data, setData] = useState<ViewTeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewEmail) {
      setError("Geen manager opgegeven om te bekijken.");
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const response = await fetch(
          `/api/manager/view-team?mode=${modeParam}&email=${encodeURIComponent(viewEmail)}&_t=${Date.now()}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          const err = (await response.json()) as { error?: string };
          throw new Error(err.error ?? "Team laden mislukt");
        }
        const teamData = (await response.json()) as ViewTeamResponse;
        setData(teamData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Onbekende fout");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [modeParam, viewEmail]);

  if (loading) {
    return (
      <AppShell title="Team bekijken" subtitle="Team laden…">
        <p style={{ textAlign: "center", padding: "2rem", color: "var(--brand)" }}>Team laden…</p>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell title="Team bekijken" subtitle="Fout bij laden">
        <p className="error-text">{error ?? "Team niet gevonden"}</p>
        <p>
          <Link href={isWkMode ? "/manager/world-cup/league" : "/manager/league"}>
            ← Terug naar competitie
          </Link>
        </p>
      </AppShell>
    );
  }

  const formationSlots = buildFormationSlots(data.formation);
  const playerIndex = [...data.lineup];
  const pitchRows = formationSlots.map((row) =>
    row.map((slot) => {
      const player = playerIndex.shift() ?? null;
      return { position: slot, player };
    }),
  );
  const lineupById = new Map(data.lineup.map((p) => [p.id, p]));
  const sortedBench = sortByPosition(data.bench);
  const totalPoints = [...data.lineup, ...data.bench].reduce((sum, p) => sum + (p.punten ?? 0), 0);

  return (
    <AppShell
      title={`${data.teamName}`}
      subtitle={
        <>
          Manager: {data.managerName}
          {data.isOwnTeam ? " (jouw team)" : " (read-only)"} · Budget: €{data.budgetRemaining.toFixed(1)}M van €{data.budgetCap}M
        </>
      }
    >
      <p style={{ marginBottom: "0.5rem" }}>
        <Link href={isWkMode ? "/manager/world-cup/league" : "/manager/league"}>
          ← Terug naar competitie
        </Link>
      </p>

      <div className="grid">
        <section className="card col-8">
          <h2>Opstelling · {data.formation}</h2>
          <div className="pitch" style={{ maxWidth: 480, margin: "0 auto" }}>
            {pitchRows.map((row, rowIndex) => (
            <div key={rowIndex} className="pitch-row" data-size={row.length}>
              {row.map((slot, slotIndex) => {
                const player = slot.player;
                const flagUrl = player ? getCountryFlagImageUrl(player.club) : null;
                  return (
                    <div key={slotIndex} className="pitch-slot readonly-slot">
                      <div className="slot-pos">{slot.position}</div>
                      {player ? (
                        <>
                          <div className="slot-name">
                            {flagUrl ? (
                              <img src={flagUrl} alt="" className="slot-flag" width={18} height={12} />
                            ) : null}
                            {player.naam}
                          </div>
                          <div className="slot-meta">
                            {player.club} · €{player.prijs}M · {player.punten} pt
                          </div>
                        </>
                      ) : (
                        <div className="slot-name slot-empty">Leeg</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <section className="card col-4">
          <h2>Bank ({sortedBench.length})</h2>
          {sortedBench.length === 0 ? (
            <p className="muted-note">Geen wisselspelers</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {sortedBench.map((player) => {
                const flagUrl = getCountryFlagImageUrl(player.club);
                return (
                  <li key={player.id} className="bench-player-row">
                    <span className="bench-pos-badge">{player.positie}</span>
                    {flagUrl ? (
                      <img src={flagUrl} alt="" className="slot-flag" width={18} height={12} style={{ marginRight: 4 }} />
                    ) : null}
                    <strong>{player.naam}</strong>
                    <span className="muted-note"> · {player.club} · €{player.prijs}M · {player.punten} pt</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card col-12">
          <h2>Team samenvatting</h2>
          <div className="grid">
            <article className="card col-3" style={{ textAlign: "center" }}>
              <strong>{data.lineup.length + data.bench.length}</strong>
              <p className="muted-note">Spelers</p>
            </article>
            <article className="card col-3" style={{ textAlign: "center" }}>
              <strong>€{data.squadCost.toFixed(1)}M</strong>
              <p className="muted-note">Teamwaarde</p>
            </article>
            <article className="card col-3" style={{ textAlign: "center" }}>
              <strong>€{data.budgetRemaining.toFixed(1)}M</strong>
              <p className="muted-note">Budget over</p>
            </article>
            <article className="card col-3" style={{ textAlign: "center" }}>
              <strong>{totalPoints}</strong>
              <p className="muted-note">Totaal punten</p>
            </article>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

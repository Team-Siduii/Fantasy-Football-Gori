"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PlayerCard } from "@/components/player-card";
import { buildFormationSlots } from "@/domain/formation";
import { getPlayerCardMeta } from "@/lib/player-card-display";

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

  const lineupPts = data.lineup.reduce((sum, p) => sum + (p.punten ?? 0), 0);
  const benchPts = data.bench.reduce((sum, p) => sum + (p.punten ?? 0), 0);
  const totalPoints = lineupPts + benchPts;

  return (
    <AppShell
      title={data.teamName}
      subtitle={
        <span className="view-team-subtitle">
          <span className="view-team-subtitle__manager">{data.managerName}</span>
          {data.isOwnTeam && <span className="view-team-subtitle__badge">Jouw team</span>}
        </span>
      }
    >
      <p style={{ marginBottom: "0.5rem" }}>
        <Link href={isWkMode ? "/manager/world-cup/league" : "/manager/league"}>
          ← Terug naar competitie
        </Link>
      </p>

      <div className="grid">
        <section className="card col-8">
          <div className="team-topbar" aria-label="Team overzicht">
            <div className="team-topbar__metric team-topbar__metric--left">
              <span>Budget over</span>
              <strong>€ {data.budgetRemaining.toFixed(1)}M</strong>
            </div>
            <div className="team-topbar__metric team-topbar__metric--center">
              <span>Totaal punten</span>
              <strong>{totalPoints}</strong>
            </div>
            <div className="team-topbar__metric team-topbar__metric--right">
              <span>Formatie</span>
              <strong>{data.formation}</strong>
            </div>
          </div>

          <div className="formation-header">
            <h2>Basiselftal</h2>
          </div>

          <div className="pitch">
            {pitchRows.map((row, rowIndex) => {
              const rowStart = pitchRows.slice(0, rowIndex).reduce((sum, current) => sum + current.length, 0);

              return (
                <div key={`row-${rowIndex}`} className="pitch-row" data-size={row.length}>
                  {row.map((slot, colIndex) => {
                    const lineupIndex = rowStart + colIndex;
                    const player = slot.player;
                    const cardMeta = player ? getPlayerCardMeta(player) : { flag: "", countryCode: "", priceLabel: "", displayName: "" };

                    return (
                      <PlayerCard
                        key={`lineup-${lineupIndex}-${player?.id ?? `empty-${colIndex}`}`}
                        position={cardMeta.flag}
                        club={cardMeta.countryCode}
                        name={player?.naam ?? "Leeg"}
                        pointsLabel={cardMeta.priceLabel}
                        scoreBadge={player ? String(player.punten) : null}
                        className={player ? undefined : "player-card--open"}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        <section className="card col-4">
          <h2>Wisselspelers</h2>
          <div className="bench-grid">
            {data.bench.length === 0 ? (
              <p className="muted-note">Geen wisselspelers</p>
            ) : (
              data.bench.map((player, benchIndex) => {
                const cardMeta = getPlayerCardMeta(player);
                return (
                  <PlayerCard
                    key={`bench-${benchIndex}-${player.id}`}
                    position={cardMeta.flag}
                    club={cardMeta.countryCode}
                    name={player.naam}
                    pointsLabel={cardMeta.priceLabel}
                    scoreBadge={String(Math.ceil(player.punten / 2))}
                    className="player-card--bench-row"
                  />
                );
              })
            )}
          </div>
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

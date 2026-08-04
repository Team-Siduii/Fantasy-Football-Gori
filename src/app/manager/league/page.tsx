"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { WORLD_CUP_2026_FIXTURES } from "@/lib/world-cup-schedule";

type RankingEntry = {
  managerId: string;
  displayName: string;
  teamName: string;
  email: string;
  subpoule: string;
  totalPoints: number;
  currentRoundPoints: number;
  budgetRemaining: number;
};

type LeagueRankingResponse = {
  mode: string;
  currentRound: number;
  selectedRound: number;
  userSubpoule: string;
  userEmail: string;
  leagueName: string;
  ranking: RankingEntry[];
  allSubpoules: Record<string, RankingEntry[]>;
};

function getPositionBadge(pos: number) {
  if (pos === 1) return { icon: "🥇", className: "rank-badge--gold" };
  if (pos === 2) return { icon: "🥈", className: "rank-badge--silver" };
  if (pos === 3) return { icon: "🥉", className: "rank-badge--bronze" };
  return { icon: `${pos}`, className: "" };
}

function getPointsTrend(points: number): "up" | "down" | "neutral" {
  if (points > 0) return "up";
  return "neutral";
}

export default function ManagerLeaguePage() {
  const pathname = usePathname();
  const router = useRouter();
  const isWkMode = pathname.startsWith("/manager/world-cup");
  const modeParam = isWkMode ? "wk" : "eredivisie";

  const wkRounds = useMemo(
    () => Array.from(new Set(WORLD_CUP_2026_FIXTURES.map((fixture) => fixture.round))).sort((a, b) => a - b),
    [],
  );

  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [selectedRound, setSelectedRound] = useState<number>(0);
  const [userSubpoule, setUserSubpoule] = useState<string>("A");
  const [userEmail, setUserEmail] = useState<string>("");
  const [leagueName, setLeagueName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRanking = useCallback(async (roundOverride?: number) => {
    try {
      setLoading(true);
      const effectiveRound = isWkMode ? (roundOverride ?? selectedRound) : 0;
      const roundParam = isWkMode && effectiveRound > 0 ? `&roundNumber=${effectiveRound}` : "";
      const response = await fetch(`/api/manager/league-ranking?mode=${modeParam}${roundParam}&_t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? "Ranglijst laden mislukt");
      }
      const data = (await response.json()) as LeagueRankingResponse;
      setRanking(data.ranking);
      setCurrentRound(data.currentRound);
      setUserSubpoule(data.userSubpoule);
      setUserEmail(data.userEmail);
      setLeagueName(data.leagueName);
      if (isWkMode && data.selectedRound > 0) {
        setSelectedRound((previous) => (previous === data.selectedRound ? previous : data.selectedRound));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, [isWkMode, modeParam, selectedRound]);

  useEffect(() => {
    void loadRanking();
    const timer = window.setInterval(() => {
      void loadRanking();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadRanking]);

  const activeRound = isWkMode ? (selectedRound || currentRound) : currentRound;
  const selectedRoundIndex = isWkMode ? wkRounds.findIndex((round) => round === activeRound) : -1;
  const hasPreviousRound = isWkMode && selectedRoundIndex > 0;
  const hasNextRound = isWkMode && selectedRoundIndex >= 0 && selectedRoundIndex < wkRounds.length - 1;

  function viewTeam(entry: RankingEntry) {
    const basePath = isWkMode ? "/manager/world-cup/view-team" : "/manager/view-team";
    const roundSuffix = isWkMode && activeRound > 0 ? `&round=${activeRound}` : "";
    router.push(`${basePath}?view=${encodeURIComponent(entry.email)}${roundSuffix}`);
  }

  function goToRound(direction: -1 | 1) {
    if (!isWkMode || selectedRoundIndex < 0) {
      return;
    }
    const nextRound = wkRounds[selectedRoundIndex + direction];
    if (!nextRound) {
      return;
    }
    setSelectedRound(nextRound);
  }

  const roundPointsLabel = activeRound > 0
    ? `Ronde ${activeRound}`
    : "Ronde";
  const totalPointsLabel = activeRound > 0
    ? `Totaal t/m ${activeRound}`
    : "Totaal";
  const ownRank = ranking.findIndex((entry) => entry.email.toLowerCase() === userEmail.toLowerCase()) + 1;

  return (
    <AppShell
      title="Competitie"
      subtitle={
        isWkMode
          ? `${leagueName || "Competitie"} · Ranglijst${activeRound > 0 ? ` · Ronde ${activeRound}` : ""}`
          : `${leagueName || "Competitie"} · Ranglijst`
      }
    >
      {loading ? (
        <div className="league-loader">
          <div className="league-loader__spinner" />
          <span>Ranglijst laden…</span>
        </div>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : ranking.length === 0 ? (
        <div className="league-empty">
          <span className="league-empty__icon">🏆</span>
          <p>Nog geen teams in jouw subpoule.</p>
          <p className="league-empty__hint">Zodra de draft start verschijnen hier de teams.</p>
        </div>
      ) : (
        <div className="league-board">
          <div className="league-summary">
            <div className="league-summary__identity">
              <span className="league-summary__eyebrow">Mijn competitie</span>
              <span className="league-summary__label">{leagueName || `Poule ${userSubpoule}`}</span>
            </div>

            <div className="league-summary__stats">
              <span className="league-summary-pill">
                <span className="league-summary-pill__label">Teams</span>
                <strong className="league-summary-pill__value">{ranking.length}</strong>
              </span>
              {ownRank > 0 ? (
                <span className="league-summary-pill league-summary-pill--accent">
                  <span className="league-summary-pill__label">Jouw plek</span>
                  <strong className="league-summary-pill__value">#{ownRank}</strong>
                </span>
              ) : null}
            </div>

            {isWkMode && activeRound > 0 ? (
              <div className="league-summary__round-nav">
                <button
                  type="button"
                  className="round-nav-button"
                  onClick={() => goToRound(-1)}
                  disabled={!hasPreviousRound}
                  aria-label="Vorige ronde"
                >
                  ‹
                </button>
                <div className="round-title-wrap">
                  <span className="round-title-label">Overzicht</span>
                  <span className="league-summary__round">Ronde {activeRound}</span>
                </div>
                <button
                  type="button"
                  className="round-nav-button"
                  onClick={() => goToRound(1)}
                  disabled={!hasNextRound}
                  aria-label="Volgende ronde"
                >
                  ›
                </button>
              </div>
            ) : currentRound > 0 ? (
              <span className="league-summary__round">Ronde {currentRound}</span>
            ) : null}
          </div>

          <div className="league-row league-row--header">
            <div className="league-col league-col--pos">#</div>
            <div className="league-col league-col--team">Team</div>
            <div className="league-col league-col--action">Actie</div>
            <div className="league-col league-col--round">{roundPointsLabel}</div>
            <div className="league-col league-col--points">{totalPointsLabel}</div>
          </div>

          {ranking.map((entry, idx) => {
            const badge = getPositionBadge(idx + 1);
            const trend = getPointsTrend(entry.currentRoundPoints);
            const isOwnTeam = entry.email.toLowerCase() === userEmail.toLowerCase();
            const rankNumber = idx + 1;

            return (
              <div
                key={entry.email}
                className={`league-row${isOwnTeam ? " league-row--own" : ""}${rankNumber <= 3 ? ` league-row--podium league-row--podium-${rankNumber}` : ""}`}
              >
                <div className="league-col league-col--pos">
                  <span className={`rank-badge ${badge.className}`}>{badge.icon}</span>
                </div>

                <div className="league-col league-col--team">
                  <div className="league-team-meta">
                    <span className="league-team-name-wrap">
                      <span className="league-team-name">{entry.teamName}</span>
                      {isOwnTeam ? <span className="league-team-badge">Jij</span> : null}
                    </span>
                    <span className="league-team-manager">{entry.displayName}</span>
                  </div>
                </div>

                <div className="league-col league-col--action">
                  <button
                    type="button"
                    className="league-view-button"
                    onClick={() => viewTeam(entry)}
                    title={`Bekijk team van ${entry.teamName}`}
                    aria-label={`Bekijk team van ${entry.teamName}`}
                  >
                    <span>Bekijk</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </div>

                <div className="league-col league-col--round">
                  <span className={`league-round-points league-round-points--${trend}`}>
                    {entry.currentRoundPoints}
                  </span>
                </div>

                <div className="league-col league-col--points">
                  <span className="league-points">{entry.totalPoints}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

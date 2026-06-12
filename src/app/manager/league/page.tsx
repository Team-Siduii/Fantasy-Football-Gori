"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";

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
  // Simple heuristic: positive points show "up" trend
  if (points > 0) return "up";
  return "neutral";
}

export default function ManagerLeaguePage() {
  const pathname = usePathname();
  const router = useRouter();
  const isWkMode = pathname.startsWith("/manager/world-cup");
  const modeParam = isWkMode ? "wk" : "eredivisie";

  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [userSubpoule, setUserSubpoule] = useState<string>("A");
  const [userEmail, setUserEmail] = useState<string>("");
  const [leagueName, setLeagueName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRanking = useCallback(async () => {
    try {
      const response = await fetch(`/api/manager/league-ranking?mode=${modeParam}&_t=${Date.now()}`, {
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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, [modeParam]);

  useEffect(() => {
    void loadRanking();
    const timer = window.setInterval(() => {
      void loadRanking();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadRanking]);

  function viewTeam(entry: RankingEntry) {
    const basePath = isWkMode ? "/manager/world-cup/view-team" : "/manager/view-team";
    router.push(`${basePath}?view=${encodeURIComponent(entry.email)}`);
  }

  const roundLabel = currentRound > 0
    ? `Huidige ronde · punten`
    : "Huidige ronde";

  return (
    <AppShell
      title="Competitie"
      subtitle={
        isWkMode
          ? `${leagueName || "Competitie"} · Ranglijst${currentRound > 0 ? ` · Ronde ${currentRound}` : ""}`
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
          {/* Poule header summary */}
          <div className="league-summary">
            <span className="league-summary__label">{leagueName || `Poule ${userSubpoule}`}</span>
            <span className="league-summary__count">{ranking.length} teams</span>
            {currentRound > 0 && (
              <span className="league-summary__round">Ronde {currentRound}</span>
            )}
          </div>

          {/* Column headers */}
          <div className="league-row league-row--header">
            <span className="league-col league-col--rank">#</span>
            <span className="league-col league-col--team">Team</span>
            <span className="league-col league-col--total">Totaal</span>
            <span className="league-col league-col--round">{roundLabel}</span>
            <span className="league-col league-col--budget">Budget</span>
          </div>

          {/* Ranking rows */}
          {ranking.map((entry, index) => {
            const pos = index + 1;
            const badge = getPositionBadge(pos);
            const isOwn = entry.email === userEmail;
            const trend = getPointsTrend(entry.currentRoundPoints);

            return (
              <div
                key={entry.email}
                className={`league-row${isOwn ? " league-row--own" : ""}${pos <= 3 ? ` league-row--podium league-row--podium-${pos}` : ""}`}
              >
                {/* Rank */}
                <span className={`league-col league-col--rank ${badge.className}`}>
                  {badge.icon}
                </span>

                {/* Team info */}
                <div className="league-col league-col--team">
                  <button
                    type="button"
                    className="league-team-link"
                    onClick={() => viewTeam(entry)}
                    title={`Bekijk team van ${entry.teamName}`}
                  >
                    <span className="league-team-name">{entry.teamName}</span>
                    <span className="league-team-manager">{entry.displayName}</span>
                  </button>
                </div>

                {/* Total points */}
                <div className="league-col league-col--total">
                  <span className="league-points">{entry.totalPoints}</span>
                </div>

                {/* Current round points */}
                <div className="league-col league-col--round">
                  <span className={`league-round-points league-round-points--${trend}`}>
                    {entry.currentRoundPoints}
                  </span>
                </div>

                {/* Budget */}
                <div className="league-col league-col--budget">
                  <span className="league-budget">€{entry.budgetRemaining.toFixed(1)}M</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

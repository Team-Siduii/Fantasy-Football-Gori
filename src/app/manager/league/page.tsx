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
  ranking: RankingEntry[];
  allSubpoules: Record<string, RankingEntry[]>;
};

export default function ManagerLeaguePage() {
  const pathname = usePathname();
  const router = useRouter();
  const isWkMode = pathname.startsWith("/manager/world-cup");
  const modeParam = isWkMode ? "wk" : "eredivisie";

  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [userSubpoule, setUserSubpoule] = useState<string>("A");
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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, [modeParam]);

  useEffect(() => {
    void loadRanking();
    // Poll elke 30 seconden voor live updates tijdens wedstrijden
    const timer = window.setInterval(() => {
      void loadRanking();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadRanking]);

  function viewTeam(entry: RankingEntry) {
    // Navigeer naar read-only teamweergave
    const basePath = isWkMode ? "/manager/world-cup/view-team" : "/manager/view-team";
    router.push(`${basePath}?view=${encodeURIComponent(entry.email)}`);
  }

  return (
    <AppShell
      title="Mijn competitie"
      subtitle={
        isWkMode
          ? `Subpoule ${userSubpoule} · Ranglijst op totaalpunten${currentRound > 0 ? ` · Ronde ${currentRound} actief` : ""}`
          : `Subpoule ${userSubpoule} · Ranglijst op totaalpunten`
      }
    >
      {loading ? (
        <p style={{ textAlign: "center", padding: "2rem", color: "var(--brand)" }}>Ranglijst laden…</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : ranking.length === 0 ? (
        <p style={{ textAlign: "center", padding: "2rem" }}>Nog geen teams in jouw subpoule.</p>
      ) : (
        <div className="grid">
          <section className="card col-12">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Team</th>
                    <th>Manager</th>
                    <th>Totaal punten</th>
                    <th>Ronde {currentRound || "?"} punten</th>
                    <th>Budget over</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((entry, index) => (
                    <tr key={entry.email}>
                      <td>{index + 1}</td>
                      <td>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => viewTeam(entry)}
                          title={`Bekijk team van ${entry.teamName}`}
                        >
                          {entry.teamName}
                        </button>
                      </td>
                      <td>{entry.displayName}</td>
                      <td><strong>{entry.totalPoints}</strong></td>
                      <td>{entry.currentRoundPoints}</td>
                      <td>€{entry.budgetRemaining.toFixed(1)}M</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

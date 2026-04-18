"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import type { PlayerRecord } from "@/domain/player";
import { derivePlayerPoints } from "@/lib/player-derived";
import {
  getCurrentOrNextRound,
  groupFixturesByRound,
  REMAINING_FIXTURES_2025_2026,
  SCHEDULE_SPONSOR,
} from "@/lib/season-schedule";

type MvpStateResponse = {
  snapshot: {
    managerTradeWindow: { isOpen: boolean; opensAt: string; closesAt: string };
    currentRoundTransferLimit: number;
  };
};

type ClubStanding = {
  club: string;
  points: number;
};

export default function ManagerLeaguePage() {
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [round, setRound] = useState<number | null>(() => getCurrentOrNextRound(REMAINING_FIXTURES_2025_2026, new Date()));
  const [transferLimit, setTransferLimit] = useState<number | null>(null);
  const [windowOpen, setWindowOpen] = useState<boolean>(false);

  useEffect(() => {
    const load = async () => {
      const [playersResponse, stateResponse] = await Promise.all([
        fetch("/api/players", { cache: "no-store" }),
        fetch("/api/mvp-state", { cache: "no-store" }),
      ]);

      if (playersResponse.ok) {
        const playersData = (await playersResponse.json()) as { players: PlayerRecord[] };
        setPlayers(playersData.players || []);
      }

      if (stateResponse.ok) {
        const stateData = (await stateResponse.json()) as MvpStateResponse;
        setTransferLimit(stateData.snapshot.currentRoundTransferLimit);
        setWindowOpen(stateData.snapshot.managerTradeWindow.isOpen);
      }

      setRound(getCurrentOrNextRound(REMAINING_FIXTURES_2025_2026, new Date()));
    };

    void load();
  }, []);

  const standings = useMemo<ClubStanding[]>(() => {
    const byClub = new Map<string, number>();

    for (const player of players) {
      const current = byClub.get(player.club) ?? 0;
      byClub.set(player.club, current + derivePlayerPoints(player));
    }

    return [...byClub.entries()]
      .map(([club, points]) => ({ club, points }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 10);
  }, [players]);

  const groupedFixtures = useMemo(() => groupFixturesByRound(REMAINING_FIXTURES_2025_2026), []);

  return (
    <AppShell title="Competities" subtitle="Stand en resterende Eredivisie-speelrondes voor seizoen 2025/2026.">
      <div className="grid">
        <section className="card col-8">
          <h2>Stand (club-power ranking)</h2>
          <ol>
            {standings.map((item) => (
              <li key={item.club}>
                {item.club} — {item.points} pt
              </li>
            ))}
          </ol>
        </section>

        <section className="card col-4">
          <h2>Ronde-info</h2>
          <ul>
            <li>Volgende speelronde: {round ?? "-"}</li>
            <li>Transfer window: {windowOpen ? "open" : "gesloten"}</li>
            <li>Transferlimiet: {transferLimit ?? "-"}</li>
            <li>Bonusrondes: 5, 10, 20</li>
          </ul>
        </section>

        <section className="card col-12">
          <h2>Resterend schema seizoen 2025/2026</h2>
          <p className="muted-note">Gesponsord door {SCHEDULE_SPONSOR}. Ingedeeld in speelrondes 31 t/m 34.</p>

          {groupedFixtures.map((group) => (
            <div key={`round-${group.round}`} className="table-wrap" style={{ marginBottom: "0.85rem" }}>
              <h3>Speelronde {group.round}</h3>
              <table>
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Tijd</th>
                    <th>Home</th>
                    <th>Away</th>
                  </tr>
                </thead>
                <tbody>
                  {group.fixtures.map((fixture) => (
                    <tr key={`${group.round}-${fixture.kickoffAt}-${fixture.home}-${fixture.away}`}>
                      <td>{fixture.dateLabel}</td>
                      <td>{fixture.kickoff}</td>
                      <td>{fixture.home}</td>
                      <td>{fixture.away}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}

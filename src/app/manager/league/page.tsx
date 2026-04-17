"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import type { PlayerRecord } from "@/domain/player";
import { derivePlayerPoints } from "@/lib/player-derived";

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
  const [round, setRound] = useState<number | null>(null);
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

      setRound(9);
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

  const fixtures = useMemo(() => {
    const clubs = standings.slice(0, 8).map((item) => item.club);
    const result: Array<{ home: string; away: string }> = [];

    for (let i = 0; i + 1 < clubs.length; i += 2) {
      result.push({ home: clubs[i], away: clubs[i + 1] });
    }

    return result;
  }, [standings]);

  return (
    <AppShell title="Competities" subtitle="Stand en ronde-info gebaseerd op ingeladen CSV-spelers.">
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
            <li>Ronde: {round ?? "-"}</li>
            <li>Transfer window: {windowOpen ? "open" : "gesloten"}</li>
            <li>Transferlimiet: {transferLimit ?? "-"}</li>
            <li>Bonusrondes: 5, 10, 20</li>
          </ul>
        </section>

        <section className="card col-12">
          <h2>Volgende fixtures</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Home</th>
                  <th>Away</th>
                </tr>
              </thead>
              <tbody>
                {fixtures.map((fixture) => (
                  <tr key={`${fixture.home}-${fixture.away}`}>
                    <td>{fixture.home}</td>
                    <td>{fixture.away}</td>
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

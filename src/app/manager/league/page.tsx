"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import type { PlayerRecord } from "@/domain/player";
import { derivePlayerPoints } from "@/lib/player-derived";
import {
  getCurrentOrNextRound,
  groupFixturesByRound,
  REMAINING_FIXTURES_2025_2026,
  SCHEDULE_SPONSOR,
} from "@/lib/season-schedule";
import { WORLD_CUP_2026_FIXTURES } from "@/lib/world-cup-schedule";

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
  const pathname = usePathname();
  const isWkMode = pathname.startsWith("/manager/world-cup");
  const activeFixtures = isWkMode ? WORLD_CUP_2026_FIXTURES : REMAINING_FIXTURES_2025_2026;
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [round, setRound] = useState<number | null>(() => getCurrentOrNextRound(activeFixtures, new Date()));
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

      setRound(getCurrentOrNextRound(activeFixtures, new Date()));
    };

    void load();
  }, [activeFixtures]);

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

  const groupedFixtures = useMemo(() => groupFixturesByRound(activeFixtures), [activeFixtures]);

  return (
    <AppShell
      title="Competities"
      subtitle={
        isWkMode
          ? "Stand en WK-speelrondes. Ronde 1/2/3 = alle landen hebben respectievelijk 1/2/3 groepsduels gespeeld."
          : "Stand en resterende Eredivisie-speelrondes voor seizoen 2025/2026."
      }
    >
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
            <li>{isWkMode ? "WK speelrondes: 1 (MD1), 2 (MD2), 3 (MD3)" : "Bonusrondes: 5, 10, 20"}</li>
          </ul>
        </section>

        <section className="card col-12">
          <h2>{isWkMode ? "WK 2026 schema" : "Resterend schema seizoen 2025/2026"}</h2>
          <p className="muted-note">
            {isWkMode
              ? "Ronde-definitie WK: ronde 1/2/3 betekent dat alle landen respectievelijk hun 1e/2e/3e groepswedstrijd hebben gespeeld."
              : `Gesponsord door ${SCHEDULE_SPONSOR}. Ingedeeld in speelrondes 31 t/m 34.`}
          </p>

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

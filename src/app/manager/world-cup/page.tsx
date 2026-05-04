"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { countTeamsByConfederation, WORLD_CUP_2026_PHASES, WORLD_CUP_2026_TEAMS } from "@/lib/world-cup-2026";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
}

export default function ManagerWorldCupPage() {
  const byConfederation = useMemo(() => countTeamsByConfederation(WORLD_CUP_2026_TEAMS), []);

  return (
    <AppShell title="WK 2026" subtitle="Aparte WK-module naast de Eredivisie-competitie: deelnemende landen en toernooischema.">
      <div className="grid">
        <section className="card col-4">
          <h2>WK snapshot</h2>
          <ul>
            <li>Hosts: Canada, Mexico, Verenigde Staten</li>
            <li>Teams: {WORLD_CUP_2026_TEAMS.length}</li>
            <li>Wedstrijden: 104</li>
            <li>Periode: 11-06-2026 t/m 19-07-2026</li>
          </ul>
        </section>

        <section className="card col-8">
          <h2>Verdeling per confederatie</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Confederatie</th>
                  <th>Aantal landen</th>
                </tr>
              </thead>
              <tbody>
                {[...byConfederation.entries()].map(([confed, count]) => (
                  <tr key={confed}>
                    <td>{confed}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card col-12">
          <h2>Deelnemende landen (48)</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Land</th>
                  <th>Confederatie</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {WORLD_CUP_2026_TEAMS.map((team) => (
                  <tr key={team.name}>
                    <td>{team.name}</td>
                    <td>{team.confederation}</td>
                    <td>{team.qualification}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card col-12">
          <h2>WK speelschema 2026</h2>
          <p className="muted-note">Schema op fase-niveau; na selectiepublicatie kunnen we hier per land selecties + matchdetails op matchniveau aan koppelen.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fase</th>
                  <th>Start</th>
                  <th>Einde</th>
                  <th>Matches</th>
                  <th>Notitie</th>
                </tr>
              </thead>
              <tbody>
                {WORLD_CUP_2026_PHASES.map((phase) => (
                  <tr key={phase.phase}>
                    <td>{phase.phase}</td>
                    <td>{formatDate(phase.startsAt)}</td>
                    <td>{formatDate(phase.endsAt)}</td>
                    <td>{phase.matchCount}</td>
                    <td>{phase.notes ?? "-"}</td>
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

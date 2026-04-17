import { AppShell } from "@/components/app-shell";

const mockTeams = [
  { name: "FC Slot", budget: 2.5, spelers: 15, formatie: "4-3-3" },
  { name: "De Polder Galácticos", budget: 1.0, spelers: 15, formatie: "3-5-2" },
  { name: "Utrecht Ultras", budget: 0.5, spelers: 14, formatie: "4-4-2" },
];

export default function TeamsPage() {
  return (
    <AppShell title="Teams" subtitle="Eerste overzicht van roster, budget en opstelling per team.">
      <div className="card col-12">
        <h2>Teamoverzicht</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Spelers</th>
                <th>Formatie</th>
                <th>Budget over</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {mockTeams.map((team) => (
                <tr key={team.name}>
                  <td>{team.name}</td>
                  <td>{team.spelers}/15</td>
                  <td>{team.formatie}</td>
                  <td>€ {team.budget.toFixed(1)}M</td>
                  <td>{team.spelers === 15 ? "Compleet" : "Onvolledig"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

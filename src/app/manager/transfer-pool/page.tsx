import { AppShell } from "@/components/app-shell";

const transferPool = [
  { naam: "Santiago Giménez", positie: "FWD", club: "Feyenoord", prijs: "€ 11.0M" },
  { naam: "Quinten Timber", positie: "MID", club: "Feyenoord", prijs: "€ 9.0M" },
  { naam: "Bart Verbruggen", positie: "GK", club: "Brighton", prijs: "€ 6.5M" },
];

export default function ManagerTransferPoolPage() {
  return (
    <AppShell title="Transfer Pool" subtitle="Beschikbare spelers voor je ronde-transfer.">
      <section className="card col-12">
        <h2>Beschikbaar</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Speler</th>
                <th>Positie</th>
                <th>Club</th>
                <th>Prijs</th>
              </tr>
            </thead>
            <tbody>
              {transferPool.map((item) => (
                <tr key={item.naam}>
                  <td>{item.naam}</td>
                  <td>{item.positie}</td>
                  <td>{item.club}</td>
                  <td>{item.prijs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

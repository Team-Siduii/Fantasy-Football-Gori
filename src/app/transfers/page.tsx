import { AppShell } from "@/components/app-shell";

export default function TransfersPage() {
  return (
    <AppShell title="Transfers" subtitle="Pre-season manager trades, limieten en vensters.">
      <div className="grid">
        <section className="card col-6">
          <h2>Regels (actief)</h2>
          <ul>
            <li>Manager-trade alleen pre-season (na draft, vóór eerste wedstrijd)</li>
            <li>Pakketdeals toegestaan (n-voor-m)</li>
            <li>Expliciete goedkeuring door beide managers</li>
            <li>Alleen budgetlimiet; geen per-ronde limiet voor pre-season trades</li>
          </ul>
        </section>

        <section className="card col-6">
          <h2>Ronde-transfers</h2>
          <ul>
            <li>Standaard: 1 transfer per ronde</li>
            <li>Bonusrondes: 3 transfers</li>
            <li>Refresh policy: 3 retries x 1 minuut, daarna admin-alert</li>
          </ul>
        </section>

        <section className="card col-12">
          <h2>Tradeboard (placeholder)</h2>
          <p>
            Volgende implementatie: voorstel aanmaken, accept/reject, intrekken en automatische sluiting bij competitie-start.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

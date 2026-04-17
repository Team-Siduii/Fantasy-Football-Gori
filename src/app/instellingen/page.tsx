import { AppShell } from "@/components/app-shell";

export default function InstellingenPage() {
  return (
    <AppShell title="Instellingen" subtitle="League instellingen voor transferregels en rondes.">
      <div className="grid">
        <section className="card col-6">
          <h2>Transferbeleid</h2>
          <ul>
            <li>Standaard limiet: 1</li>
            <li>Bonusrondes: 5, 10, 20</li>
            <li>Buitenland-vervanging buiten limiet: aan</li>
          </ul>
        </section>

        <section className="card col-6">
          <h2>Notificaties</h2>
          <ul>
            <li>Draft aan de beurt</li>
            <li>Speler teruggezet naar pool tijdens draft</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

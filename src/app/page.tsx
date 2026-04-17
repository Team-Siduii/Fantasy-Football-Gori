import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function HomePage() {
  return (
    <AppShell title="Dashboard" subtitle="Klikbare eerste UI versie voor jouw fantasy app.">
      <div className="grid">
        <section className="card col-4">
          <h3>Draft</h3>
          <p>Bekijk pickvolgorde en test draftflow per ronde.</p>
          <Link href="/draft" className="cta">
            Open Draft
          </Link>
        </section>

        <section className="card col-4">
          <h3>Teams</h3>
          <p>Overzicht van rosters, budget en formatiecontrole.</p>
          <Link href="/teams" className="cta">
            Open Teams
          </Link>
        </section>

        <section className="card col-4">
          <h3>Transfers</h3>
          <p>Pre-season manager trades en ronde-limieten in één scherm.</p>
          <Link href="/transfers" className="cta">
            Open Transfers
          </Link>
        </section>

        <section className="card col-8">
          <h2>MVP status</h2>
          <ul>
            <li>CSV upload + parsing voor Coach van het Jaar formaat</li>
            <li>Basis API endpoints staan live</li>
            <li>Klikbare pagina&apos;s voor kernflows staan klaar</li>
          </ul>
        </section>

        <section className="card col-4">
          <h2>Admin</h2>
          <p>Upload spelerslijst en bekijk direct de ingeladen data.</p>
          <Link href="/admin/players" className="cta">
            Open Spelers CSV
          </Link>
        </section>
      </div>
    </AppShell>
  );
}

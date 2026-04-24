import { AppShell } from "@/components/app-shell";
import { LeagueConfigEditor } from "@/components/league-config-editor";

export default function InstellingenPage() {
  return (
    <AppShell title="Instellingen" subtitle="League instellingen voor transferregels, scoring en competitiemodes.">
      <div className="grid">
        <section className="card col-6">
          <h2>Sprint 2 modules</h2>
          <ul>
            <li>Waiver/Blind bid mode v1 (gesloten biedingen + reveal)</li>
            <li>Scoring profiles: Classic en Custom</li>
            <li>Competition pack: League table + Cup knockout</li>
            <li>Rollenmodel: owner / commissioner / manager</li>
          </ul>
        </section>

        <section className="card col-6">
          <h2>Notificaties</h2>
          <ul>
            <li>Draft aan de beurt</li>
            <li>Speler teruggezet naar pool tijdens draft</li>
            <li>Transferwindow open/closing soon</li>
            <li>Trade approval requested</li>
          </ul>
        </section>

        <LeagueConfigEditor />
      </div>
    </AppShell>
  );
}

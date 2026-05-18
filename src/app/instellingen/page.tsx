import { AppShell } from "@/components/app-shell";
import { LeagueConfigEditor } from "@/components/league-config-editor";
import { resolveLeagueAdminConfigPath } from "@/lib/league-admin-config";
import { resolveManagerStatePath } from "@/lib/manager-state";

export default function InstellingenPage() {
  const eredivisieStatePath = resolveManagerStatePath("eredivisie");
  const wkStatePath = resolveManagerStatePath("wk");
  const eredivisieConfigPath = resolveLeagueAdminConfigPath("eredivisie");
  const wkConfigPath = resolveLeagueAdminConfigPath("wk");

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

        <section className="card col-12">
          <h2>State-opslag per mode (debug)</h2>
          <p className="muted-note">Actieve opslagpaden voor manager-state. Gebruik dit om staging/prod runtime-isolatie te controleren.</p>
          <ul>
            <li>
              <strong>Eredivisie mode:</strong> <code>{eredivisieStatePath}</code>
            </li>
            <li>
              <strong>WK mode:</strong> <code>{wkStatePath}</code>
            </li>
          </ul>
        </section>

        <section className="card col-12">
          <h2>League-config opslag per mode (debug)</h2>
          <p className="muted-note">Instellingen worden nu per competitie apart opgeslagen zodat WK en Eredivisie los configureerbaar zijn.</p>
          <ul>
            <li>
              <strong>Eredivisie config:</strong> <code>{eredivisieConfigPath}</code>
            </li>
            <li>
              <strong>WK config:</strong> <code>{wkConfigPath}</code>
            </li>
          </ul>
        </section>

        <LeagueConfigEditor />
      </div>
    </AppShell>
  );
}

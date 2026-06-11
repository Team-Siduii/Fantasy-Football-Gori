import { AppShell } from "@/components/app-shell";
import { IntegrityHealthPanel } from "@/components/integrity-health-panel";
import { LeagueConfigEditor } from "@/components/league-config-editor";
import { resolveLeagueAdminConfigPath } from "@/lib/league-admin-config";
import { resolveManagerStatePath } from "@/lib/manager-state";
import Link from "next/link";

export default function InstellingenPage() {
  const eredivisieStatePath = resolveManagerStatePath("eredivisie");
  const wkStatePath = resolveManagerStatePath("wk");
  const eredivisieConfigPath = resolveLeagueAdminConfigPath("eredivisie");
  const wkConfigPath = resolveLeagueAdminConfigPath("wk");

  return (
    <AppShell title="Instellingen" subtitle="Beheer je league regels snel, veilig en per competitie-mode gescheiden.">
      <div className="grid">
        <section className="card col-4">
          <h2>Zo gebruik je dit</h2>
          <ol className="settings-steps-list">
            <li>Kies eerst Eredivisie of WK.</li>
            <li>Pas alleen die mode aan.</li>
            <li>Sla op en ga door naar de andere mode.</li>
          </ol>
        </section>

        <section className="card col-4">
          <h2>Wat je hier beheert</h2>
          <ul>
            <li>Scoring-profiel en cup tie policy</li>
            <li>Waiver tie-breaker per competitie</li>
            <li>Commissioners en managers per mode</li>
          </ul>
        </section>

        <section className="card col-4">
          <h2>Belangrijk</h2>
          <p className="muted-note">Instellingen zijn volledig gescheiden tussen WK en Eredivisie. Wijzigingen in WK hebben geen effect op Eredivisie en andersom.</p>
        </section>

        <section className="card col-4">
          <h2>Profiel</h2>
          <p>Pas je managernaam, teamnaam of wachtwoord aan.</p>
          <p><Link href="/account" style={{ fontWeight: 600, color: "var(--brand)" }}>Profiel aanpassen →</Link></p>
        </section>

        <LeagueConfigEditor />
        <IntegrityHealthPanel />

        <details className="card col-12 settings-debug-panel">
          <summary>Technische opslagpaden (debug)</summary>
          <div className="settings-debug-grid">
            <div>
              <h3>Manager state</h3>
              <p>
                <strong>Eredivisie:</strong> <code>{eredivisieStatePath}</code>
              </p>
              <p>
                <strong>WK:</strong> <code>{wkStatePath}</code>
              </p>
            </div>
            <div>
              <h3>League config</h3>
              <p>
                <strong>Eredivisie:</strong> <code>{eredivisieConfigPath}</code>
              </p>
              <p>
                <strong>WK:</strong> <code>{wkConfigPath}</code>
              </p>
            </div>
          </div>
        </details>
      </div>
    </AppShell>
  );
}

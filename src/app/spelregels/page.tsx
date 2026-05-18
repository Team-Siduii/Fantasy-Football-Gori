import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getLeagueAdminConfig } from "@/lib/league-admin-config";

type PageProps = {
  searchParams?: Promise<{ mode?: string }>;
};

function resolveMode(input?: string): "eredivisie" | "wk" {
  return input === "wk" ? "wk" : "eredivisie";
}

export default async function SpelregelsPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const mode = resolveMode(params?.mode);
  const config = getLeagueAdminConfig(mode);

  const impactRules = [
    `Budgetcap: teamwaarde mag maximaal €${config.budget.teamValueCapMillions.toFixed(1)}M zijn in ${mode === "wk" ? "WK" : "Eredivisie"}.`,
    `Scoring profiel: ${config.scoringProfile.label} (${config.scoringProfile.type}).`,
    `Waiver tie-breaker: ${config.waiver.round.tieBreaker === "EARLIEST_BID" ? "Earliest bid" : "Priority"}.`,
    `Cup tie policy: ${config.competition.cupTiePolicy === "HIGHER_SEED" ? "Higher seed" : "Penalties"}.`,
  ];

  return (
    <AppShell
      title="Spelregels"
      subtitle="Deze pagina wordt automatisch opgebouwd vanuit Instellingen. Regelwijzigingen en impact worden hier direct zichtbaar."
    >
      <div className="grid">
        <section className="card col-12">
          <div className="settings-editor-head">
            <h2>Actieve competitie: {mode === "wk" ? "WK" : "Eredivisie"}</h2>
            <div className="mode-switch-buttons">
              <Link href="/spelregels?mode=eredivisie" className={`mode-switch-button ${mode === "eredivisie" ? "active" : ""}`}>
                Eredivisie
              </Link>
              <Link href="/spelregels?mode=wk" className={`mode-switch-button ${mode === "wk" ? "active" : ""}`}>
                WK
              </Link>
            </div>
          </div>
          <p className="muted-note">Pas regels aan via Instellingen en deze pagina update mee.</p>
        </section>

        <section className="card col-6 settings-subcard">
          <h3>Kernregels (dynamisch)</h3>
          <ul>
            <li>Budgetcap: €{config.budget.teamValueCapMillions.toFixed(1)}M</li>
            <li>Scoring profiel: {config.scoringProfile.label}</li>
            <li>Waiver tie-breaker: {config.waiver.round.tieBreaker === "EARLIEST_BID" ? "Earliest bid" : "Priority"}</li>
            <li>Cup tie policy: {config.competition.cupTiePolicy === "HIGHER_SEED" ? "Higher seed" : "Penalties"}</li>
          </ul>
        </section>

        <section className="card col-6 settings-subcard">
          <h3>Impact van huidige regels</h3>
          <ul>
            {impactRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>

        <section className="card col-12 settings-subcard">
          <h3>Aanvullende regels</h3>
          {config.customRuleNotes.length === 0 ? (
            <p className="muted-note">Nog geen aanvullende regels. Voeg ze toe in Instellingen → Aanvullende spelregels.</p>
          ) : (
            <div className="grid" style={{ marginTop: 8 }}>
              {config.customRuleNotes.map((note) => (
                <article key={note.id} className="card col-12">
                  <h4 style={{ marginTop: 0, marginBottom: 6 }}>{note.title || "Naamloze regel"}</h4>
                  <p style={{ marginTop: 0 }}><strong>Beschrijving:</strong> {note.description || "-"}</p>
                  <p style={{ marginBottom: 0 }}><strong>Impact:</strong> {note.impact || "Nog niet ingevuld"}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

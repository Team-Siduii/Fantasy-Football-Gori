import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getLeagueAdminConfigPersistent } from "@/lib/league-admin-config";

type PageProps = {
  searchParams?: Promise<{ mode?: string }>;
};

function resolveMode(input?: string): "eredivisie" | "wk" {
  return input === "wk" ? "wk" : "eredivisie";
}

export default async function SpelregelsPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const mode = resolveMode(params?.mode);
  const config = await getLeagueAdminConfigPersistent(mode);

  const modeLabel = mode === "wk" ? "WK" : "Eredivisie";
  const transferLimit = 1;
  const bonusLimit = 3;

  const chapterCards = [
    {
      key: "transferregels",
      title: "1. Transferregels",
      bullets: [
        `Standaard transferlimiet: ${transferLimit} per speelronde.`,
        `Bonusrondes hebben limiet ${bonusLimit} transfers.`,
        "Transferflow: eerst verkopen, daarna kopen op open placeholder.",
      ],
    },
    {
      key: "budgetregels",
      title: "2. Budgetregels",
      bullets: [
        `Budget cap in ${modeLabel}: €${config.budget.teamValueCapMillions.toFixed(1)}M.`,
        "Teamwaarde mag niet boven de cap uitkomen.",
        "Budget mag op 0 eindigen, maar niet negatief worden.",
      ],
    },
    {
      key: "waiverregels",
      title: "3. Waiverregels",
      bullets: [
        `Tie-breaker policy: ${config.waiver.round.tieBreaker === "EARLIEST_BID" ? "Earliest bid" : "Priority"}.`,
        "Waiver-gedrag volgt de actuele instellingen van de actieve mode.",
      ],
    },
    {
      key: "strafregels",
      title: "4. Strafregels & tie policy",
      bullets: [
        `Cup tie policy: ${config.competition.cupTiePolicy === "HIGHER_SEED" ? "Higher seed" : "Penalties"}.`,
        `Scoring profiel: ${config.scoringProfile.label} (${config.scoringProfile.type}).`,
      ],
    },
  ];

  return (
    <AppShell
      title="Spelregels"
      subtitle="Deze pagina wordt automatisch opgebouwd vanuit Instellingen. Regelwijzigingen en impact worden hier direct zichtbaar."
    >
      <div className="grid">
        <section className="card col-12">
          <div className="settings-editor-head">
            <h2>Actieve competitie: {modeLabel}</h2>
            <div className="mode-switch-buttons">
              <Link href="/spelregels?mode=eredivisie" className={`mode-switch-button ${mode === "eredivisie" ? "active" : ""}`}>
                Eredivisie
              </Link>
              <Link href="/spelregels?mode=wk" className={`mode-switch-button ${mode === "wk" ? "active" : ""}`}>
                WK
              </Link>
            </div>
          </div>
          <p className="muted-note">Pas regels aan via Instellingen en deze pagina update direct mee per hoofdstuk.</p>
        </section>

        {chapterCards.map((chapter) => (
          <section key={chapter.key} className="card col-6 settings-subcard">
            <h3>{chapter.title}</h3>
            <ul>
              {chapter.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </section>
        ))}

        <section className="card col-12 settings-subcard">
          <h3>5. Aanvullende regels (Custom)</h3>
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

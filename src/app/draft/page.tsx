import { AppShell } from "@/components/app-shell";
import { buildDraftPickSequence } from "@/domain/rules";

export default function DraftPage() {
  const teams = ["Team A", "Team B", "Team C", "Team D"];
  const picks = buildDraftPickSequence(teams, 16);

  return (
    <AppShell title="Draft" subtitle="Patroon A, A, reverse(A) zichtbaar gemaakt voor snelle test.">
      <div className="grid">
        <section className="card col-6">
          <h2>Draftvolgorde</h2>
          <ol>
            {picks.map((team, i) => (
              <li key={`${team}-${i}`}>
                Pick {i + 1}: {team}
              </li>
            ))}
          </ol>
        </section>

        <section className="card col-6">
          <h2>Volgende stap</h2>
          <p>Hier komt hierna de echte pick-interactie met:</p>
          <ul>
            <li>speler selecteren</li>
            <li>speler terug naar pool</li>
            <li>notificatie-event bij terugzetten</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

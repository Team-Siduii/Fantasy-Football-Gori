import { buildMvpSnapshot } from "@/domain/mvp-snapshot";
import { buildDraftPickSequence } from "@/domain/rules";
import { mockLeagueConfig } from "@/lib/mock-league";

function fmt(iso: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(iso));
}

export default function HomePage() {
  const snapshot = buildMvpSnapshot(mockLeagueConfig, new Date());
  const sampleTeams = ["Team A", "Team B", "Team C", "Team D"];
  const first16Picks = buildDraftPickSequence(sampleTeams, 16);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "2.5rem 1rem", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Fantasy Football Gori — MVP v0.1</h1>
      <p style={{ opacity: 0.8, marginBottom: "1.5rem" }}>
        Eerste werkende versie met kernregels uit het functioneel design.
      </p>

      <section style={{ background: "#fff", border: "1px solid #e6e8ee", borderRadius: 12, padding: "1rem", marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Transfer en vensters</h2>
        <ul>
          <li>Huidige ronde: {mockLeagueConfig.currentRound}</li>
          <li>Transferlimiet deze ronde: {snapshot.currentRoundTransferLimit}</li>
          <li>Manager-trade venster open: {snapshot.managerTradeWindow.isOpen ? "Ja" : "Nee"}</li>
          <li>Trade venster start: {fmt(snapshot.managerTradeWindow.opensAt)}</li>
          <li>Trade venster sluit: {fmt(snapshot.managerTradeWindow.closesAt)}</li>
        </ul>
      </section>

      <section style={{ background: "#fff", border: "1px solid #e6e8ee", borderRadius: 12, padding: "1rem", marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Free pool retry policy</h2>
        <ul>
          <li>Retries: {snapshot.freePoolRetryPolicy.maxRetries}</li>
          <li>Interval: {snapshot.freePoolRetryPolicy.intervalSeconds} seconden</li>
          <li>Na retries: alleen admin alert</li>
        </ul>
      </section>

      <section style={{ background: "#fff", border: "1px solid #e6e8ee", borderRadius: 12, padding: "1rem", marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>MVP notificaties</h2>
        <ul>
          {snapshot.notifications.map((eventKey) => (
            <li key={eventKey}>{eventKey}</li>
          ))}
        </ul>
      </section>

      <section style={{ background: "#fff", border: "1px solid #e6e8ee", borderRadius: 12, padding: "1rem", marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Draft patroon (A, A, reverse(A)) voorbeeld</h2>
        <p style={{ marginTop: 0, opacity: 0.8 }}>Eerste 16 picks voor 4 teams:</p>
        <ol>
          {first16Picks.map((team, index) => (
            <li key={`${team}-${index}`}>
              Pick {index + 1}: {team}
            </li>
          ))}
        </ol>
      </section>

      <section style={{ background: "#fff", border: "1px solid #e6e8ee", borderRadius: 12, padding: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Handmatige test</h2>
        <p style={{ marginTop: 0 }}>Ga naar <a href="/admin/players">/admin/players</a> om je spelers-CSV te uploaden en direct te bekijken.</p>
      </section>
    </main>
  );
}

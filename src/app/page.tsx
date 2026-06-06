import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticatedSession } from "@/lib/auth-session";

const previewItems = [
  "Bekijk je eigen team, draft en transfers pas na inloggen.",
  "Geen sessie actief? Dan blijf je veilig op deze publieke startpagina.",
  "Managers zien na login direct hun eigen teamcontext.",
];

export default async function HomePage() {
  if (await isAuthenticatedSession()) {
    redirect("/manager/my-team");
  }

  return (
    <main className="public-home-shell">
      <section className="public-home-card" aria-labelledby="public-home-title">
        <p className="public-home-eyebrow">Fantasy Football Gori</p>
        <h1 id="public-home-title">Je bent nog niet ingelogd</h1>
        <p className="public-home-lead">
          Welkom op de startpagina. Log in als manager om je team, draft, transfers en league-data te bekijken.
        </p>

        <div className="public-home-status" role="status" aria-live="polite">
          <span className="public-home-status-dot" aria-hidden="true" />
          Geen actieve managersessie
        </div>

        <div className="public-home-actions">
          <Link href="/login" className="public-home-primary">
            Inloggen als manager
          </Link>
          <Link href="/forgot-password" className="public-home-secondary">
            Wachtwoord vergeten
          </Link>
        </div>

        <ul className="public-home-list" aria-label="Wat gebeurt er zonder login">
          {previewItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

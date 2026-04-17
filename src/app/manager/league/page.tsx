import { AppShell } from "@/components/app-shell";

export default function ManagerLeaguePage() {
  return (
    <AppShell title="League Page" subtitle="Stand, rondes en belangrijke league-status.">
      <div className="grid">
        <section className="card col-8">
          <h2>Stand</h2>
          <ol>
            <li>FC Slot — 88 pt</li>
            <li>De Polder Galácticos — 84 pt</li>
            <li>Utrecht Ultras — 77 pt</li>
            <li>Zwolle Zuid — 70 pt</li>
          </ol>
        </section>

        <section className="card col-4">
          <h2>Ronde-info</h2>
          <ul>
            <li>Ronde: 9</li>
            <li>Transfer window: open</li>
            <li>Bonusrondes: 5, 10, 20</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

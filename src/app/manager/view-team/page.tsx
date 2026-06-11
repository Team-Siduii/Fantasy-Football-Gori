import { Suspense } from "react";
import ViewTeamPageContent from "./view-team-content";

export default function ViewTeamPage() {
  return (
    <Suspense fallback={<p style={{ textAlign: "center", padding: "2rem" }}>Team laden…</p>}>
      <ViewTeamPageContent />
    </Suspense>
  );
}

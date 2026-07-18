// Uitgeschakelde teams na groepsfase WK 2026 (Round 3→4)
// Fetched from WKCoach players/all?round_seq=4 — only 937 players remain (from 1248)

const ELIMINATED_TEAMS = new Set([
  "Curaçao",
  "Haïti",
  "Irak",
  "Jordanië",
  "Nieuw-Zeeland",
  "Panama",
  "Qatar",
  "Saudi-Arabië",
  "Tsjechië",
  "Tunesië",
  "Turkije",
  "Uruguay",
]);

export function isTeamEliminated(club: string): boolean {
  return ELIMINATED_TEAMS.has(club);
}

export function isPlayerEliminated(club: string, _playerId?: string): boolean {
  return isTeamEliminated(club);
}

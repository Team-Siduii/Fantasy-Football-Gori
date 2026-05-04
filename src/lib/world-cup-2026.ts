export type WorldCupTeam = {
  name: string;
  confederation: "AFC" | "CAF" | "CONCACAF" | "CONMEBOL" | "OFC" | "UEFA";
  qualification: "Host" | "Qualified";
};

export type WorldCupPhase = {
  phase: string;
  startsAt: string;
  endsAt: string;
  matchCount: number;
  notes?: string;
};

export const WORLD_CUP_2026_TEAMS: WorldCupTeam[] = [
  { name: "Argentina", confederation: "CONMEBOL", qualification: "Qualified" },
  { name: "Algeria", confederation: "CAF", qualification: "Qualified" },
  { name: "Australia", confederation: "AFC", qualification: "Qualified" },
  { name: "Austria", confederation: "UEFA", qualification: "Qualified" },
  { name: "Belgium", confederation: "UEFA", qualification: "Qualified" },
  { name: "Bosnia and Herzegovina", confederation: "UEFA", qualification: "Qualified" },
  { name: "Brazil", confederation: "CONMEBOL", qualification: "Qualified" },
  { name: "Canada", confederation: "CONCACAF", qualification: "Host" },
  { name: "Cape Verde", confederation: "CAF", qualification: "Qualified" },
  { name: "Colombia", confederation: "CONMEBOL", qualification: "Qualified" },
  { name: "Croatia", confederation: "UEFA", qualification: "Qualified" },
  { name: "Curaçao", confederation: "CONCACAF", qualification: "Qualified" },
  { name: "Czech Republic", confederation: "UEFA", qualification: "Qualified" },
  { name: "DR Congo", confederation: "CAF", qualification: "Qualified" },
  { name: "Ecuador", confederation: "CONMEBOL", qualification: "Qualified" },
  { name: "Egypt", confederation: "CAF", qualification: "Qualified" },
  { name: "England", confederation: "UEFA", qualification: "Qualified" },
  { name: "France", confederation: "UEFA", qualification: "Qualified" },
  { name: "Germany", confederation: "UEFA", qualification: "Qualified" },
  { name: "Ghana", confederation: "CAF", qualification: "Qualified" },
  { name: "Haiti", confederation: "CONCACAF", qualification: "Qualified" },
  { name: "Iran", confederation: "AFC", qualification: "Qualified" },
  { name: "Iraq", confederation: "AFC", qualification: "Qualified" },
  { name: "Ivory Coast", confederation: "CAF", qualification: "Qualified" },
  { name: "Japan", confederation: "AFC", qualification: "Qualified" },
  { name: "Jordan", confederation: "AFC", qualification: "Qualified" },
  { name: "Mexico", confederation: "CONCACAF", qualification: "Host" },
  { name: "Morocco", confederation: "CAF", qualification: "Qualified" },
  { name: "Netherlands", confederation: "UEFA", qualification: "Qualified" },
  { name: "New Zealand", confederation: "OFC", qualification: "Qualified" },
  { name: "Norway", confederation: "UEFA", qualification: "Qualified" },
  { name: "Panama", confederation: "CONCACAF", qualification: "Qualified" },
  { name: "Paraguay", confederation: "CONMEBOL", qualification: "Qualified" },
  { name: "Portugal", confederation: "UEFA", qualification: "Qualified" },
  { name: "Qatar", confederation: "AFC", qualification: "Qualified" },
  { name: "Saudi Arabia", confederation: "AFC", qualification: "Qualified" },
  { name: "Scotland", confederation: "UEFA", qualification: "Qualified" },
  { name: "Senegal", confederation: "CAF", qualification: "Qualified" },
  { name: "South Africa", confederation: "CAF", qualification: "Qualified" },
  { name: "South Korea", confederation: "AFC", qualification: "Qualified" },
  { name: "Spain", confederation: "UEFA", qualification: "Qualified" },
  { name: "Sweden", confederation: "UEFA", qualification: "Qualified" },
  { name: "Switzerland", confederation: "UEFA", qualification: "Qualified" },
  { name: "Tunisia", confederation: "CAF", qualification: "Qualified" },
  { name: "Turkey", confederation: "UEFA", qualification: "Qualified" },
  { name: "United States", confederation: "CONCACAF", qualification: "Host" },
  { name: "Uruguay", confederation: "CONMEBOL", qualification: "Qualified" },
  { name: "Uzbekistan", confederation: "AFC", qualification: "Qualified" },
];

export const WORLD_CUP_2026_PHASES: WorldCupPhase[] = [
  { phase: "Groepsfase", startsAt: "2026-06-11", endsAt: "2026-06-27", matchCount: 72, notes: "12 groepen van 4 teams" },
  { phase: "1/16 finale", startsAt: "2026-06-28", endsAt: "2026-07-03", matchCount: 16 },
  { phase: "1/8 finale", startsAt: "2026-07-04", endsAt: "2026-07-07", matchCount: 8 },
  { phase: "Kwartfinales", startsAt: "2026-07-09", endsAt: "2026-07-11", matchCount: 4 },
  { phase: "Halve finales", startsAt: "2026-07-14", endsAt: "2026-07-15", matchCount: 2 },
  { phase: "Troostfinale", startsAt: "2026-07-18", endsAt: "2026-07-18", matchCount: 1 },
  { phase: "Finale", startsAt: "2026-07-19", endsAt: "2026-07-19", matchCount: 1, notes: "MetLife Stadium (New York/New Jersey)" },
];

export function countTeamsByConfederation(teams: WorldCupTeam[]) {
  const counts = new Map<WorldCupTeam["confederation"], number>([
    ["AFC", 0],
    ["CAF", 0],
    ["CONCACAF", 0],
    ["CONMEBOL", 0],
    ["OFC", 0],
    ["UEFA", 0],
  ]);

  for (const team of teams) {
    counts.set(team.confederation, (counts.get(team.confederation) ?? 0) + 1);
  }

  return counts;
}

import type { SeasonFixture } from "@/lib/season-schedule";

export const WORLD_CUP_2026_FIXTURES: SeasonFixture[] = [
  // Speelronde 1: elke deelnemer speelt wedstrijd 1 (groepsfase MD1)
  { round: 1, dateLabel: "Donderdag 11 juni 2026", kickoff: "20:00", kickoffAt: "2026-06-11T20:00:00-05:00", home: "Mexico", away: "South Africa" },
  { round: 1, dateLabel: "Vrijdag 12 juni 2026", kickoff: "18:00", kickoffAt: "2026-06-12T18:00:00-04:00", home: "Canada", away: "Morocco" },
  { round: 1, dateLabel: "Vrijdag 12 juni 2026", kickoff: "21:00", kickoffAt: "2026-06-12T21:00:00-07:00", home: "United States", away: "Curaçao" },
  { round: 1, dateLabel: "Zaterdag 13 juni 2026", kickoff: "14:00", kickoffAt: "2026-06-13T14:00:00-05:00", home: "Argentina", away: "Norway" },
  { round: 1, dateLabel: "Zaterdag 13 juni 2026", kickoff: "17:00", kickoffAt: "2026-06-13T17:00:00-05:00", home: "Brazil", away: "Scotland" },
  { round: 1, dateLabel: "Zaterdag 13 juni 2026", kickoff: "20:00", kickoffAt: "2026-06-13T20:00:00-05:00", home: "France", away: "Iraq" },
  { round: 1, dateLabel: "Zondag 14 juni 2026", kickoff: "14:00", kickoffAt: "2026-06-14T14:00:00-05:00", home: "England", away: "Haiti" },
  { round: 1, dateLabel: "Zondag 14 juni 2026", kickoff: "17:00", kickoffAt: "2026-06-14T17:00:00-05:00", home: "Spain", away: "Jordan" },

  // Speelronde 2: elke deelnemer speelt wedstrijd 2 (groepsfase MD2)
  { round: 2, dateLabel: "Woensdag 17 juni 2026", kickoff: "18:00", kickoffAt: "2026-06-17T18:00:00-05:00", home: "Mexico", away: "Qatar" },
  { round: 2, dateLabel: "Woensdag 17 juni 2026", kickoff: "21:00", kickoffAt: "2026-06-17T21:00:00-05:00", home: "United States", away: "Turkey" },
  { round: 2, dateLabel: "Donderdag 18 juni 2026", kickoff: "18:00", kickoffAt: "2026-06-18T18:00:00-04:00", home: "Canada", away: "Switzerland" },
  { round: 2, dateLabel: "Donderdag 18 juni 2026", kickoff: "21:00", kickoffAt: "2026-06-18T21:00:00-05:00", home: "Argentina", away: "Egypt" },
  { round: 2, dateLabel: "Vrijdag 19 juni 2026", kickoff: "17:00", kickoffAt: "2026-06-19T17:00:00-05:00", home: "Brazil", away: "Ghana" },
  { round: 2, dateLabel: "Vrijdag 19 juni 2026", kickoff: "20:00", kickoffAt: "2026-06-19T20:00:00-05:00", home: "Germany", away: "Japan" },
  { round: 2, dateLabel: "Zaterdag 20 juni 2026", kickoff: "17:00", kickoffAt: "2026-06-20T17:00:00-05:00", home: "Portugal", away: "Paraguay" },
  { round: 2, dateLabel: "Zaterdag 20 juni 2026", kickoff: "20:00", kickoffAt: "2026-06-20T20:00:00-05:00", home: "Netherlands", away: "South Korea" },

  // Speelronde 3: elke deelnemer speelt wedstrijd 3 (groepsfase MD3)
  { round: 3, dateLabel: "Maandag 22 juni 2026", kickoff: "18:00", kickoffAt: "2026-06-22T18:00:00-05:00", home: "Mexico", away: "Czech Republic" },
  { round: 3, dateLabel: "Maandag 22 juni 2026", kickoff: "21:00", kickoffAt: "2026-06-22T21:00:00-05:00", home: "United States", away: "Panama" },
  { round: 3, dateLabel: "Dinsdag 23 juni 2026", kickoff: "18:00", kickoffAt: "2026-06-23T18:00:00-04:00", home: "Canada", away: "Austria" },
  { round: 3, dateLabel: "Dinsdag 23 juni 2026", kickoff: "21:00", kickoffAt: "2026-06-23T21:00:00-05:00", home: "Argentina", away: "Tunisia" },
  { round: 3, dateLabel: "Woensdag 24 juni 2026", kickoff: "17:00", kickoffAt: "2026-06-24T17:00:00-05:00", home: "France", away: "Uzbekistan" },
  { round: 3, dateLabel: "Woensdag 24 juni 2026", kickoff: "20:00", kickoffAt: "2026-06-24T20:00:00-05:00", home: "England", away: "Iraq" },
  { round: 3, dateLabel: "Donderdag 25 juni 2026", kickoff: "17:00", kickoffAt: "2026-06-25T17:00:00-05:00", home: "Spain", away: "Senegal" },
  { round: 3, dateLabel: "Donderdag 25 juni 2026", kickoff: "20:00", kickoffAt: "2026-06-25T20:00:00-05:00", home: "Brazil", away: "Belgium" },

  // Knock-out rondes
  { round: 4, dateLabel: "Zondag 28 juni 2026", kickoff: "18:00", kickoffAt: "2026-06-28T18:00:00-05:00", home: "1A", away: "3C" },
  { round: 4, dateLabel: "Maandag 29 juni 2026", kickoff: "20:00", kickoffAt: "2026-06-29T20:00:00-05:00", home: "1B", away: "3D" },
  { round: 5, dateLabel: "Zaterdag 4 juli 2026", kickoff: "18:00", kickoffAt: "2026-07-04T18:00:00-05:00", home: "Win R4-1", away: "Win R4-2" },
  { round: 6, dateLabel: "Dinsdag 14 juli 2026", kickoff: "19:00", kickoffAt: "2026-07-14T19:00:00-05:00", home: "Win QF-1", away: "Win QF-2" },
  { round: 7, dateLabel: "Zondag 19 juli 2026", kickoff: "20:00", kickoffAt: "2026-07-19T20:00:00-04:00", home: "Win SF-1", away: "Win SF-2" },
];

import type { NormalizedMatch, NormalizedMatchEvent } from "./match-events-merge";

export type TheSportsDbEvent = {
  idEvent: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  intHomeScore?: string | number;
  intAwayScore?: string | number;
  strTimestamp?: string;
  strHomeGoalDetails?: string;
  strAwayGoalDetails?: string;
  strHomeYellowCards?: string;
  strAwayYellowCards?: string;
  strHomeRedCards?: string;
  strAwayRedCards?: string;
  strHomeLineupGoalkeeper?: string;
  strAwayLineupGoalkeeper?: string;
};

function toNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseMinutePlayerList(input: string | undefined, type: NormalizedMatchEvent["type"], team: string, source: "thesportsdb"): NormalizedMatchEvent[] {
  if (!input) return [];
  return input
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [minuteRaw, ...nameParts] = chunk.split(":");
      const minute = Number(minuteRaw);
      return {
        type,
        minute: Number.isFinite(minute) ? minute : null,
        team,
        playerName: nameParts.join(":").trim() || null,
        playerExternalId: null,
        source,
        confidence: "medium" as const,
      };
    });
}

export function mapTheSportsDbEventsToNormalized(events: TheSportsDbEvent[]): NormalizedMatch[] {
  return events.map((event) => {
    const homeTeam = event.strHomeTeam ?? "Onbekend thuis";
    const awayTeam = event.strAwayTeam ?? "Onbekend uit";

    const goals = [
      ...parseMinutePlayerList(event.strHomeGoalDetails, "goal", homeTeam, "thesportsdb"),
      ...parseMinutePlayerList(event.strAwayGoalDetails, "goal", awayTeam, "thesportsdb"),
    ];
    const yellowCards = [
      ...parseMinutePlayerList(event.strHomeYellowCards, "yellow_card", homeTeam, "thesportsdb"),
      ...parseMinutePlayerList(event.strAwayYellowCards, "yellow_card", awayTeam, "thesportsdb"),
    ];
    const redCards = [
      ...parseMinutePlayerList(event.strHomeRedCards, "red_card", homeTeam, "thesportsdb"),
      ...parseMinutePlayerList(event.strAwayRedCards, "red_card", awayTeam, "thesportsdb"),
    ];

    const saves: NormalizedMatchEvent[] = [];
    if (event.strHomeLineupGoalkeeper) {
      saves.push({ type: "goalkeeper_save", minute: null, team: homeTeam, playerName: event.strHomeLineupGoalkeeper, playerExternalId: null, source: "thesportsdb", confidence: "low" });
    }
    if (event.strAwayLineupGoalkeeper) {
      saves.push({ type: "goalkeeper_save", minute: null, team: awayTeam, playerName: event.strAwayLineupGoalkeeper, playerExternalId: null, source: "thesportsdb", confidence: "low" });
    }

    const all = [...goals, ...yellowCards, ...redCards, ...saves];
    const scoreFTHome = toNumber(event.intHomeScore);
    const scoreFTAway = toNumber(event.intAwayScore);
    const scoreFT = scoreFTHome !== null && scoreFTAway !== null ? { home: scoreFTHome, away: scoreFTAway } : null;

    const quality = {
      hasScoreHT: false,
      hasScoreFT: scoreFT !== null,
      hasGoals: goals.length > 0,
      hasAssists: false,
      hasSaves: saves.length > 0,
      hasCards: yellowCards.length + redCards.length > 0,
      completeness: 0,
    };
    quality.completeness = Math.round((Object.values(quality).filter(Boolean).length / 6) * 100);

    return {
      source: "thesportsdb",
      sourceMatchId: event.idEvent,
      kickoffAt: event.strTimestamp ?? null,
      homeTeam,
      awayTeam,
      scoreHT: null,
      scoreFT,
      events: all,
      quality,
    } as NormalizedMatch;
  });
}

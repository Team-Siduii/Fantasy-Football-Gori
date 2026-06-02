export type NormalizedEventType = "goal" | "assist" | "yellow_card" | "red_card" | "goalkeeper_save";
export type NormalizedSource = "openligadb" | "thesportsdb" | "worldcupjson" | "flashfootball";

export type NormalizedMatchEvent = {
  type: NormalizedEventType;
  minute: number | null;
  team: string | null;
  playerName: string | null;
  playerExternalId: string | null;
  relatedPlayerName?: string | null;
  source: NormalizedSource;
  confidence: "high" | "medium" | "low";
};

export type NormalizedMatch = {
  source: NormalizedSource;
  sourceMatchId: string;
  kickoffAt: string | null;
  homeTeam: string;
  awayTeam: string;
  scoreHT: { home: number; away: number } | null;
  scoreFT: { home: number; away: number } | null;
  events: NormalizedMatchEvent[];
  quality: {
    hasScoreHT: boolean;
    hasScoreFT: boolean;
    hasGoals: boolean;
    hasAssists: boolean;
    hasSaves: boolean;
    hasCards: boolean;
    completeness: number;
  };
};

function keyForMatch(match: NormalizedMatch): string {
  const kickoff = match.kickoffAt ?? "no-kickoff";
  return `${match.homeTeam.toLowerCase()}|${match.awayTeam.toLowerCase()}|${kickoff}`;
}

function computeQuality(events: NormalizedMatchEvent[], scoreHT: NormalizedMatch["scoreHT"], scoreFT: NormalizedMatch["scoreFT"]) {
  const hasGoals = events.some((event) => event.type === "goal");
  const hasAssists = events.some((event) => event.type === "assist");
  const hasSaves = events.some((event) => event.type === "goalkeeper_save");
  const hasCards = events.some((event) => event.type === "yellow_card" || event.type === "red_card");

  const quality = {
    hasScoreHT: scoreHT !== null,
    hasScoreFT: scoreFT !== null,
    hasGoals,
    hasAssists,
    hasSaves,
    hasCards,
  };

  const completeness = Math.round((Object.values(quality).filter(Boolean).length / 6) * 100);
  return { ...quality, completeness };
}

export function mergeNormalizedMatches(primary: NormalizedMatch[], secondary: NormalizedMatch[]): NormalizedMatch[] {
  const secondaryMap = new Map(secondary.map((m) => [keyForMatch(m), m]));

  return primary.map((base) => {
    const extra = secondaryMap.get(keyForMatch(base));
    if (!extra) return base;

    const preferredScoreHT = base.scoreHT ?? extra.scoreHT;
    const preferredScoreFT = base.scoreFT ?? extra.scoreFT;

    const baseGoals = base.events.filter((event) => event.type === "goal");
    const nonGoalFromExtra = extra.events.filter((event) => event.type !== "goal");
    const mergedEvents = [...baseGoals, ...nonGoalFromExtra];

    return {
      ...base,
      source: base.source,
      scoreHT: preferredScoreHT,
      scoreFT: preferredScoreFT,
      events: mergedEvents,
      quality: computeQuality(mergedEvents, preferredScoreHT, preferredScoreFT),
    };
  });
}

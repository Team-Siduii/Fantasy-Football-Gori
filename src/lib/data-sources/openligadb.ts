import type { NormalizedMatch, NormalizedMatchEvent } from "./match-events-merge";

export type OpenLigaDbMatchResult = {
  resultName?: string;
  pointsTeam1?: number;
  pointsTeam2?: number;
};

export type OpenLigaDbGoal = {
  matchMinute?: number;
  goalGetterID?: number;
  goalGetterName?: string;
  scoreTeam1?: number;
  scoreTeam2?: number;
  comment?: string | null;
};

export type OpenLigaDbMatch = {
  matchID: number;
  matchDateTimeUTC?: string;
  team1?: { teamName?: string };
  team2?: { teamName?: string };
  matchResults?: OpenLigaDbMatchResult[];
  goals?: OpenLigaDbGoal[];
};

function pickResult(
  matchResults: OpenLigaDbMatchResult[] | undefined,
  expected: "half" | "final",
): { home: number; away: number } | null {
  if (!matchResults?.length) return null;

  const matcher = expected === "half" ? /halb|half/i : /end|final/i;
  const found = matchResults.find((result) => matcher.test(result.resultName ?? ""));

  if (!found || found.pointsTeam1 === undefined || found.pointsTeam2 === undefined) {
    return null;
  }

  return { home: found.pointsTeam1, away: found.pointsTeam2 };
}

function parseCommentEvents(goal: OpenLigaDbGoal, homeTeam: string, awayTeam: string): NormalizedMatchEvent[] {
  const comment = (goal.comment ?? "").toLowerCase();
  if (!comment) return [];

  const events: NormalizedMatchEvent[] = [];

  const addEvent = (type: "assist" | "yellow_card" | "red_card", regex: RegExp, confidence: "medium" | "low") => {
    const match = goal.comment?.match(regex);
    if (!match) return;

    events.push({
      type,
      minute: goal.matchMinute ?? null,
      team: (goal.scoreTeam1 ?? 0) >= (goal.scoreTeam2 ?? 0) ? homeTeam : awayTeam,
      playerName: match[1]?.trim() || null,
      playerExternalId: null,
      source: "openligadb",
      confidence,
    });
  };

  addEvent("assist", /assist\s*:\s*([^;]+)/i, "medium");
  addEvent("yellow_card", /yellow\s*card\s*:\s*([^;]+)/i, "low");
  addEvent("red_card", /red\s*card\s*:\s*([^;]+)/i, "low");

  return events;
}

export function mapOpenLigaDbMatchesToNormalized(matches: OpenLigaDbMatch[]): NormalizedMatch[] {
  return matches.map((match) => {
    const homeTeam = match.team1?.teamName ?? "Onbekend thuis";
    const awayTeam = match.team2?.teamName ?? "Onbekend uit";

    const goalEvents: NormalizedMatchEvent[] = (match.goals ?? []).map((goal) => ({
      type: "goal",
      minute: goal.matchMinute ?? null,
      team: (goal.scoreTeam1 ?? 0) >= (goal.scoreTeam2 ?? 0) ? homeTeam : awayTeam,
      playerName: goal.goalGetterName?.trim() || null,
      playerExternalId: goal.goalGetterID !== undefined ? String(goal.goalGetterID) : null,
      source: "openligadb",
      confidence: "high",
    }));

    const parsedCommentEvents = (match.goals ?? []).flatMap((goal) => parseCommentEvents(goal, homeTeam, awayTeam));
    const allEvents = [...goalEvents, ...parsedCommentEvents];

    const scoreHT = pickResult(match.matchResults, "half");
    const scoreFT = pickResult(match.matchResults, "final");

    const quality = {
      hasScoreHT: scoreHT !== null,
      hasScoreFT: scoreFT !== null,
      hasGoals: goalEvents.length > 0,
      hasAssists: allEvents.some((event) => event.type === "assist"),
      hasSaves: false,
      hasCards: allEvents.some((event) => event.type === "yellow_card" || event.type === "red_card"),
      completeness: 0,
    };
    quality.completeness = Math.round((Object.values(quality).filter(Boolean).length / 6) * 100);

    return {
      source: "openligadb",
      sourceMatchId: String(match.matchID),
      kickoffAt: match.matchDateTimeUTC ?? null,
      homeTeam,
      awayTeam,
      scoreHT,
      scoreFT,
      events: allEvents,
      quality,
    };
  });
}

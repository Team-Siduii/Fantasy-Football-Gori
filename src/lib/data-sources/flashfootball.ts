import type { NormalizedMatch, NormalizedMatchEvent } from "./match-events-merge";

const FLASHFOOTBALL_PROJECT_ID = "2002";
const FLASHFOOTBALL_PLAYER_PROVIDER_ID = "7";

export type FlashFootballUrls = {
  incidents: string;
  teamStats: string;
  playerSchema: string;
  playerStats: string;
};

type FlashFootballMapOptions = {
  eventId: string;
  kickoffAt?: string | null;
  homeTeam?: string;
  awayTeam?: string;
};

type FlashFootballFetchOptions = FlashFootballMapOptions & {
  fetcher?: typeof fetch;
};

type ParsedToken = { key: string; value: string };

function parseTokens(segment: string): ParsedToken[] {
  return segment
    .split("¬")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [key, ...valueParts] = part.split("÷");
      return { key, value: valueParts.join("÷") };
    })
    .filter((token) => token.key.length > 0);
}

function tokenMap(tokens: ParsedToken[]): Record<string, string> {
  return Object.fromEntries(tokens.map((token) => [token.key, token.value]));
}

function parseMinute(raw: string | undefined): number | null {
  if (!raw) return null;
  const clean = raw.replace("'", "").trim();
  const addedTime = clean.match(/^(\d+)\+(\d+)$/);
  if (addedTime) {
    return Number(addedTime[1]) + Number(addedTime[2]);
  }
  const minute = Number(clean);
  return Number.isFinite(minute) ? minute : null;
}

function teamForSide(side: string | undefined, homeTeam: string, awayTeam: string): string | null {
  if (side === "1") return homeTeam;
  if (side === "2") return awayTeam;
  return null;
}

function eventTypeForFlashLabel(label: string | undefined): NormalizedMatchEvent["type"] | null {
  const normalized = (label ?? "").toLowerCase();
  if (normalized === "goal") return "goal";
  if (normalized === "assistance" || normalized === "assist") return "assist";
  if (normalized === "yellow card") return "yellow_card";
  if (normalized === "red card") return "red_card";
  return null;
}

function chunkIncidentTokens(tokens: ParsedToken[]): Array<Record<string, string>> {
  const chunks: Array<Record<string, string>> = [];
  let current: Record<string, string> | null = null;

  for (const token of tokens) {
    if (token.key === "IE") {
      if (current) chunks.push(current);
      current = { IE: token.value };
      continue;
    }

    if (current) {
      current[token.key] = token.value;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function computeQuality(events: NormalizedMatchEvent[], scoreHT: NormalizedMatch["scoreHT"], scoreFT: NormalizedMatch["scoreFT"]): NormalizedMatch["quality"] {
  const quality = {
    hasScoreHT: scoreHT !== null,
    hasScoreFT: scoreFT !== null,
    hasGoals: events.some((event) => event.type === "goal"),
    hasAssists: events.some((event) => event.type === "assist"),
    hasSaves: events.some((event) => event.type === "goalkeeper_save"),
    hasCards: events.some((event) => event.type === "yellow_card" || event.type === "red_card"),
  };

  return {
    ...quality,
    completeness: Math.round((Object.values(quality).filter(Boolean).length / 6) * 100),
  };
}

export function buildFlashFootballUrls(eventId: string): FlashFootballUrls {
  return {
    incidents: `https://www.flashfootball.com/x/feed/df_sui_1_${eventId}`,
    teamStats: `https://www.flashfootball.com/x/feed/df_st_1_${eventId}`,
    playerSchema: `https://${FLASHFOOTBALL_PROJECT_ID}.ds.lsapp.eu/pq_graphql?_hash=epmsse&eventId=${eventId}&projectId=${FLASHFOOTBALL_PROJECT_ID}`,
    playerStats: `https://${FLASHFOOTBALL_PROJECT_ID}.ds.lsapp.eu/pq_graphql?_hash=epmsd&eventId=${eventId}&providerId=${FLASHFOOTBALL_PLAYER_PROVIDER_ID}`,
  };
}

export function extractFlashFootballEventId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9]{6,12}$/.test(trimmed)) return trimmed;

  const matchUrlEventId = trimmed.match(/\/match\/[^/]+-([A-Za-z0-9]{6,12})(?:\/|#|$)/);
  return matchUrlEventId?.[1] ?? null;
}

export function mapFlashFootballFeedToNormalized(feedText: string, options: FlashFootballMapOptions): NormalizedMatch {
  const segments = feedText.split("~").map((segment) => segment.trim()).filter(Boolean);
  const teamSegments = segments
    .map((segment) => tokenMap(parseTokens(segment)))
    .filter((fields) => fields.AA && (fields.AD || fields.AE || fields.AF));

  const homeTeam = options.homeTeam ?? teamSegments[0]?.AD ?? teamSegments[0]?.AE ?? teamSegments[0]?.AF ?? "Onbekend thuis";
  const awayTeam = options.awayTeam ?? teamSegments[1]?.AD ?? teamSegments[1]?.AE ?? teamSegments[1]?.AF ?? "Onbekend uit";

  let scoreHT: NormalizedMatch["scoreHT"] = null;
  let scoreFT: NormalizedMatch["scoreFT"] = null;
  const events: NormalizedMatchEvent[] = [];

  for (const segment of segments) {
    const tokens = parseTokens(segment);
    const fields = tokenMap(tokens);

    if (fields.AC && fields.IG !== undefined && fields.IH !== undefined) {
      const score = { home: Number(fields.IG), away: Number(fields.IH) };
      if (Number.isFinite(score.home) && Number.isFinite(score.away)) {
        if (/1st half/i.test(fields.AC)) scoreHT = score;
        scoreFT = score;
      }
    }

    if (!fields.III) continue;

    const minute = parseMinute(fields.IB);
    const team = teamForSide(fields.IA, homeTeam, awayTeam);
    let latestGoalPlayerName: string | null = null;

    for (const chunk of chunkIncidentTokens(tokens)) {
      const eventType = eventTypeForFlashLabel(chunk.IK);
      if (!eventType) continue;

      if (eventType === "goal" && fields.INX !== undefined && fields.IOX !== undefined) {
        const liveScore = { home: Number(fields.INX), away: Number(fields.IOX) };
        if (Number.isFinite(liveScore.home) && Number.isFinite(liveScore.away)) {
          scoreFT = liveScore;
        }
      }

      const event: NormalizedMatchEvent = {
        type: eventType,
        minute,
        team,
        playerName: chunk.IF?.trim() || null,
        playerExternalId: chunk.IM?.trim() || null,
        source: "flashfootball",
        confidence: "high",
      };

      if (eventType === "assist") {
        event.relatedPlayerName = latestGoalPlayerName;
      }

      events.push(event);

      if (eventType === "goal") {
        latestGoalPlayerName = event.playerName;
      }
    }
  }

  return {
    source: "flashfootball",
    sourceMatchId: options.eventId,
    kickoffAt: options.kickoffAt ?? null,
    homeTeam,
    awayTeam,
    scoreHT,
    scoreFT,
    events,
    quality: computeQuality(events, scoreHT, scoreFT),
  };
}

export async function fetchFlashFootballMatch(options: FlashFootballFetchOptions): Promise<NormalizedMatch> {
  const fetcher = options.fetcher ?? fetch;
  const urls = buildFlashFootballUrls(options.eventId);
  const response = await fetcher(urls.incidents, {
    headers: {
      Accept: "text/plain, */*",
      Referer: "https://www.flashfootball.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      "x-fsign": "SW9D1eZo",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Flashfootball incident feed failed (${response.status}) for event ${options.eventId}`);
  }

  const feedText = await response.text();
  return mapFlashFootballFeedToNormalized(feedText, options);
}

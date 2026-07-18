import {
  getLatestSyncRound,
  getWkMatches,
  getWkPlayerEvents,
  getWkPlayerPointHistory,
  type WkMatchRow,
  type WkPlayerEventRow,
  type WkPlayerPointRow,
} from "./wk-sync-store";

import { isTeamEliminated } from "./knockout-phase";

const DEFENDER_ALIASES = new Set(["DEF", "VERDEDIGER", "DEFENDER", "D"]);
const CLEAN_SHEET_EVENT_CODES = new Set(["CS"]);
const DEFENDER_CLEAN_SHEET_BONUS = 2;
const ADVANCEMENT_BONUS = 5;
const KNOCKOUT_START_ROUND = 3;

export type PlayerPointEvent = {
  eventCode: string;
  points: number;
  minute: number | null;
};

export type CalculatedWkPlayerPoints = {
  fantasyplayerId: number;
  round: number;
  name: string;
  teamName: string;
  teamCode: string;
  position: string;
  positionNl: string;
  value: number;
  roundPoints: number;
  totalPoints: number;
  advancementPoints: number;
  hasPlayed: boolean;
  numPlayed: number;
  pointEvents: PlayerPointEvent[];
  source: "wk-events-v1";
};

function normalizePosition(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

export function isDefenderPosition(position: string | null | undefined, positionNl?: string | null | undefined) {
  return DEFENDER_ALIASES.has(normalizePosition(position)) || DEFENDER_ALIASES.has(normalizePosition(positionNl));
}

export function calculateWkPlayerRoundPointsFromEvents(input: {
  events: Array<Pick<PlayerPointEvent, "eventCode" | "points">>;
  position?: string | null;
  positionNl?: string | null;
}) {
  const basePoints = input.events.reduce((sum, event) => sum + Number(event.points ?? 0), 0);
  const cleanSheetEvents = input.events.filter((event) => CLEAN_SHEET_EVENT_CODES.has((event.eventCode ?? "").trim().toUpperCase()));
  const cleanSheetBonus = isDefenderPosition(input.position, input.positionNl)
    ? cleanSheetEvents.length * DEFENDER_CLEAN_SHEET_BONUS
    : 0;
  return basePoints + cleanSheetBonus;
}

function buildMetadataMaps(rows: WkPlayerPointRow[]) {
  const latestByPlayerId = new Map<number, WkPlayerPointRow>();
  const byPlayerRound = new Map<string, WkPlayerPointRow>();
  for (const row of rows) {
    byPlayerRound.set(`${row.fantasyplayer_id}:${row.round}`, row);
    const current = latestByPlayerId.get(row.fantasyplayer_id);
    if (!current || row.round >= current.round) {
      latestByPlayerId.set(row.fantasyplayer_id, row);
    }
  }
  return { latestByPlayerId, byPlayerRound };
}

function groupEventsByRoundAndPlayer(events: WkPlayerEventRow[]) {
  const grouped = new Map<number, Map<number, PlayerPointEvent[]>>();
  for (const event of events) {
    const byPlayer = grouped.get(event.round) ?? new Map<number, PlayerPointEvent[]>();
    const playerEvents = byPlayer.get(event.fantasyplayer_id) ?? [];
    playerEvents.push({
      eventCode: event.event_code,
      points: event.points,
      minute: event.minute,
    });
    byPlayer.set(event.fantasyplayer_id, playerEvents);
    grouped.set(event.round, byPlayer);
  }

  for (const byPlayer of grouped.values()) {
    for (const eventsForPlayer of byPlayer.values()) {
      eventsForPlayer.sort((a, b) => (a.minute ?? Number.MAX_SAFE_INTEGER) - (b.minute ?? Number.MAX_SAFE_INTEGER));
    }
  }

  return grouped;
}

function normalizeTeamName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function isPlaceholderKnockoutLabel(value: string | null | undefined) {
  const normalized = normalizeTeamName(value);
  return normalized.startsWith("winnaar duel") || normalized.startsWith("verliezer duel") || normalized.startsWith("nummer ");
}

function mergeAdvancingTeam(advancingTeamsByRound: Map<number, Set<string>>, round: number, teamName: string | null | undefined) {
  if (!teamName || isPlaceholderKnockoutLabel(teamName)) {
    return;
  }

  const teams = advancingTeamsByRound.get(round) ?? new Set<string>();
  teams.add(teamName);
  advancingTeamsByRound.set(round, teams);
}

function buildAdvancingTeamsByRound(input: {
  events: WkPlayerEventRow[];
  matches: WkMatchRow[];
  byPlayerRound: Map<string, WkPlayerPointRow>;
  latestByPlayerId: Map<number, WkPlayerPointRow>;
}) {
  const advancingTeamsByRound = new Map<number, Set<string>>();
  const explicitAdvancementRounds = new Set<number>();

  for (const event of input.events) {
    if ((event.event_code ?? "").trim().toUpperCase() !== "MW") {
      continue;
    }
    explicitAdvancementRounds.add(event.round);
    const teamName = event.team_name
      ?? input.byPlayerRound.get(`${event.fantasyplayer_id}:${event.round}`)?.team_name
      ?? input.latestByPlayerId.get(event.fantasyplayer_id)?.team_name
      ?? null;
    mergeAdvancingTeam(advancingTeamsByRound, event.round, teamName);
  }

  for (const match of input.matches) {
    if (match.round <= KNOCKOUT_START_ROUND) {
      continue;
    }

    const previousRound = match.round - 1;
    if (explicitAdvancementRounds.has(previousRound)) {
      continue;
    }
    mergeAdvancingTeam(advancingTeamsByRound, previousRound, match.home_team);
    mergeAdvancingTeam(advancingTeamsByRound, previousRound, match.away_team);
  }

  return advancingTeamsByRound;
}

function calculateWkPlayerRoundAdvancementPoints(input: {
  round: number;
  teamName: string;
  advancingTeamsByRound: Map<number, Set<string>>;
}) {
  if (input.round < KNOCKOUT_START_ROUND) {
    return 0;
  }

  if (input.round === KNOCKOUT_START_ROUND) {
    return isTeamEliminated(input.teamName) ? 0 : ADVANCEMENT_BONUS;
  }

  return input.advancingTeamsByRound.get(input.round)?.has(input.teamName)
    ? ADVANCEMENT_BONUS
    : 0;
}

export async function buildCalculatedWkPlayerPointsMap(maxRound?: number): Promise<Map<number, CalculatedWkPlayerPoints>> {
  const effectiveRound = typeof maxRound === "number" && Number.isInteger(maxRound) && maxRound > 0
    ? maxRound
    : (await getLatestSyncRound()) ?? 0;

  if (effectiveRound <= 0) {
    return new Map();
  }

  const [historyRows, events, matches] = await Promise.all([
    getWkPlayerPointHistory(effectiveRound),
    getWkPlayerEvents(),
    getWkMatches(),
  ]);

  const relevantEvents = events.filter((event) => event.round <= effectiveRound);
  const { latestByPlayerId, byPlayerRound } = buildMetadataMaps(historyRows);
  const groupedEvents = groupEventsByRoundAndPlayer(relevantEvents);
  const advancingTeamsByRound = buildAdvancingTeamsByRound({
    events: relevantEvents,
    matches,
    byPlayerRound,
    latestByPlayerId,
  });
  const totals = new Map<number, CalculatedWkPlayerPoints>();
  const allPlayerIds = Array.from(latestByPlayerId.keys());

  for (let round = 1; round <= effectiveRound; round += 1) {
    const playerEventsForRound = groupedEvents.get(round) ?? new Map<number, PlayerPointEvent[]>();

    for (const fantasyplayerId of allPlayerIds) {
      const roundRow = byPlayerRound.get(`${fantasyplayerId}:${round}`);
      const metadata = roundRow ?? latestByPlayerId.get(fantasyplayerId);
      if (!metadata) {
        continue;
      }

      const pointEvents = playerEventsForRound.get(fantasyplayerId) ?? [];
      const roundPoints = calculateWkPlayerRoundPointsFromEvents({
        events: pointEvents,
        position: metadata.position,
        positionNl: metadata.position_nl,
      });
      const roundAdvancementPoints = calculateWkPlayerRoundAdvancementPoints({
        round,
        teamName: metadata.team_name,
        advancingTeamsByRound,
      });
      const previous = totals.get(fantasyplayerId);
      const previousTotal = previous?.totalPoints ?? 0;
      const previousAdvancement = previous?.advancementPoints ?? 0;

      totals.set(fantasyplayerId, {
        fantasyplayerId,
        round,
        name: metadata.name,
        teamName: metadata.team_name,
        teamCode: metadata.team_code,
        position: metadata.position,
        positionNl: metadata.position_nl,
        value: metadata.value,
        roundPoints,
        totalPoints: previousTotal + roundPoints + roundAdvancementPoints,
        advancementPoints: previousAdvancement + roundAdvancementPoints,
        hasPlayed: roundRow?.has_played ?? false,
        numPlayed: roundRow?.num_played ?? previous?.numPlayed ?? metadata.num_played,
        pointEvents,
        source: "wk-events-v1",
      });
    }
  }

  return totals;
}

export async function buildWkPlayerRoundPointsMap(roundNumber?: number): Promise<Map<number, number>> {
  const effectiveRound = typeof roundNumber === "number" && Number.isInteger(roundNumber) && roundNumber > 0
    ? roundNumber
    : (await getLatestSyncRound()) ?? 0;
  if (effectiveRound <= 0) {
    return new Map();
  }

  const [rows, events, matches] = await Promise.all([
    getWkPlayerPointHistory(effectiveRound),
    getWkPlayerEvents(effectiveRound),
    getWkMatches(),
  ]);
  const { latestByPlayerId, byPlayerRound } = buildMetadataMaps(rows);
  const roundEvents = groupEventsByRoundAndPlayer(events).get(effectiveRound) ?? new Map<number, PlayerPointEvent[]>();
  const advancingTeamsByRound = buildAdvancingTeamsByRound({
    events,
    matches,
    byPlayerRound,
    latestByPlayerId,
  });
  const allPlayerIds = Array.from(latestByPlayerId.keys());

  const result = new Map<number, number>();
  for (const fantasyplayerId of allPlayerIds) {
    const roundRow = byPlayerRound.get(`${fantasyplayerId}:${effectiveRound}`);
    const metadata = roundRow ?? latestByPlayerId.get(fantasyplayerId);
    if (!metadata) {
      continue;
    }
    const pointEvents = roundEvents.get(fantasyplayerId) ?? [];
    const basePoints = calculateWkPlayerRoundPointsFromEvents({
      events: pointEvents,
      position: metadata.position,
      positionNl: metadata.position_nl,
    });
    const advancementPoints = calculateWkPlayerRoundAdvancementPoints({
      round: effectiveRound,
      teamName: metadata.team_name,
      advancingTeamsByRound,
    });
    result.set(fantasyplayerId, basePoints + advancementPoints);
  }
  return result;
}

export async function buildWkPlayerRoundAdvancementPointsMap(roundNumber?: number): Promise<Map<number, number>> {
  const effectiveRound = typeof roundNumber === "number" && Number.isInteger(roundNumber) && roundNumber > 0
    ? roundNumber
    : (await getLatestSyncRound()) ?? 0;
  if (effectiveRound <= 0) {
    return new Map();
  }

  const [rows, events, matches] = await Promise.all([
    getWkPlayerPointHistory(effectiveRound),
    getWkPlayerEvents(effectiveRound),
    getWkMatches(),
  ]);
  const { latestByPlayerId, byPlayerRound } = buildMetadataMaps(rows);
  const roundEvents = groupEventsByRoundAndPlayer(events).get(effectiveRound) ?? new Map<number, PlayerPointEvent[]>();
  const advancingTeamsByRound = buildAdvancingTeamsByRound({
    events,
    matches,
    byPlayerRound,
    latestByPlayerId,
  });
  const allPlayerIds = Array.from(latestByPlayerId.keys());

  const result = new Map<number, number>();
  for (const fantasyplayerId of allPlayerIds) {
    const roundRow = byPlayerRound.get(`${fantasyplayerId}:${effectiveRound}`);
    const metadata = roundRow ?? latestByPlayerId.get(fantasyplayerId);
    if (!metadata) {
      continue;
    }
    const pointEvents = roundEvents.get(fantasyplayerId) ?? [];
    result.set(
      fantasyplayerId,
      calculateWkPlayerRoundAdvancementPoints({
        round: effectiveRound,
        teamName: metadata.team_name,
        advancingTeamsByRound,
      }),
    );
  }

  return result;
}

export async function buildWkPlayerTotalPointsMapThroughRound(roundNumber?: number): Promise<Map<number, number>> {
  const calculated = await buildCalculatedWkPlayerPointsMap(roundNumber);
  return new Map(Array.from(calculated.entries()).map(([fantasyplayerId, summary]) => [fantasyplayerId, summary.totalPoints]));
}

export async function listCalculatedWkPlayerPoints(roundNumber?: number): Promise<CalculatedWkPlayerPoints[]> {
  const calculated = await buildCalculatedWkPlayerPointsMap(roundNumber);
  return Array.from(calculated.values()).sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
}

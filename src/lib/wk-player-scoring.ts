import { getLatestSyncRound, getWkPlayerEvents, getWkPlayerPointHistory, type WkPlayerEventRow, type WkPlayerPointRow } from "./wk-sync-store";
import { isTeamEliminated } from "./knockout-phase";

const DEFENDER_ALIASES = new Set(["DEF", "VERDEDIGER", "DEFENDER", "D"]);
const CLEAN_SHEET_EVENT_CODES = new Set(["CS"]);
const DEFENDER_CLEAN_SHEET_BONUS = 2;

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

export async function buildCalculatedWkPlayerPointsMap(maxRound?: number): Promise<Map<number, CalculatedWkPlayerPoints>> {
  const effectiveRound = typeof maxRound === "number" && Number.isInteger(maxRound) && maxRound > 0
    ? maxRound
    : (await getLatestSyncRound()) ?? 0;

  if (effectiveRound <= 0) {
    return new Map();
  }

  const [historyRows, events] = await Promise.all([
    getWkPlayerPointHistory(effectiveRound),
    getWkPlayerEvents(),
  ]);

  const relevantEvents = events.filter((event) => event.round <= effectiveRound);
  const { latestByPlayerId, byPlayerRound } = buildMetadataMaps(historyRows);
  const groupedEvents = groupEventsByRoundAndPlayer(relevantEvents);
  const totals = new Map<number, CalculatedWkPlayerPoints>();

  for (let round = 1; round <= effectiveRound; round += 1) {
    const playerEventsForRound = groupedEvents.get(round) ?? new Map<number, PlayerPointEvent[]>();
    const playerIds = new Set<number>([
      ...Array.from(playerEventsForRound.keys()),
      ...historyRows.filter((row) => row.round === round).map((row) => row.fantasyplayer_id),
    ]);

    for (const fantasyplayerId of playerIds) {
      const row = byPlayerRound.get(`${fantasyplayerId}:${round}`) ?? latestByPlayerId.get(fantasyplayerId);
      if (!row) {
        continue;
      }
      const pointEvents = playerEventsForRound.get(fantasyplayerId) ?? [];
      const roundPoints = calculateWkPlayerRoundPointsFromEvents({
        events: pointEvents,
        position: row.position,
        positionNl: row.position_nl,
      });
      const previousTotal = totals.get(fantasyplayerId)?.totalPoints ?? 0;
      totals.set(fantasyplayerId, {
        fantasyplayerId,
        round,
        name: row.name,
        teamName: row.team_name,
        teamCode: row.team_code,
        position: row.position,
        positionNl: row.position_nl,
        value: row.value,
        roundPoints,
        totalPoints: previousTotal + roundPoints,
        advancementPoints: 0,
        hasPlayed: row.has_played,
        numPlayed: row.num_played,
        pointEvents,
        source: "wk-events-v1",
      });
    }
  }

  // Advancement bonus (Round 4+): +5 punten per speler op actief (niet-uitgeschakeld) team
  const ADVANCEMENT_BONUS = 5;
  const KNOCKOUT_START_ROUND = 3;
  if (effectiveRound >= KNOCKOUT_START_ROUND) {
    for (const [, player] of totals) {
      if (!isTeamEliminated(player.teamName)) {
        player.advancementPoints = ADVANCEMENT_BONUS;
        player.totalPoints += ADVANCEMENT_BONUS;
      }
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

  const [rows, events] = await Promise.all([
    getWkPlayerPointHistory(effectiveRound),
    getWkPlayerEvents(effectiveRound),
  ]);
  const { latestByPlayerId, byPlayerRound } = buildMetadataMaps(rows);
  const roundEvents = groupEventsByRoundAndPlayer(events).get(effectiveRound) ?? new Map<number, PlayerPointEvent[]>();
  const playerIds = new Set<number>([
    ...Array.from(roundEvents.keys()),
    ...rows.filter((row) => row.round === effectiveRound).map((row) => row.fantasyplayer_id),
  ]);

  const result = new Map<number, number>();
  for (const fantasyplayerId of playerIds) {
    const row = byPlayerRound.get(`${fantasyplayerId}:${effectiveRound}`) ?? latestByPlayerId.get(fantasyplayerId);
    if (!row) {
      continue;
    }
    const pointEvents = roundEvents.get(fantasyplayerId) ?? [];
    result.set(
      fantasyplayerId,
      calculateWkPlayerRoundPointsFromEvents({
        events: pointEvents,
        position: row.position,
        positionNl: row.position_nl,
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

export async function buildWkPlayerAdvancementPointsMap(roundNumber?: number): Promise<Map<number, number>> {
  const calculated = await buildCalculatedWkPlayerPointsMap(roundNumber);
  return new Map(Array.from(calculated.entries()).map(([fantasyplayerId, summary]) => [fantasyplayerId, summary.advancementPoints]));
}

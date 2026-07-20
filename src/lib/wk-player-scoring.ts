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
import {
  expandWkCompetitionRoundForRawReads,
  isPlaceholderKnockoutLabel,
  normalizeWkCompetitionRound,
} from "./wk-rounds";

const DEFENDER_ALIASES = new Set(["DEF", "VERDEDIGER", "DEFENDER", "D"]);
const CLEAN_SHEET_EVENT_CODES = new Set(["CS"]);
const DEFENDER_CLEAN_SHEET_BONUS = 2;
const ADVANCEMENT_BONUS = 5;
const THIRD_PLACE_ADVANCEMENT_BONUS = 3;
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

function hasLegacyFinalRound(matches: WkMatchRow[]) {
  return matches.some((match) => match.round >= 9);
}

type SharedFinalRoundContext = {
  useSharedFinalRound: boolean;
  thirdPlaceTeams: Set<string>;
  finalTeams: Set<string>;
};

function buildSharedFinalRoundContext(matches: WkMatchRow[]): SharedFinalRoundContext {
  const thirdPlaceTeams = new Set<string>();
  const finalTeams = new Set<string>();

  const addTeams = (target: Set<string>, match: WkMatchRow) => {
    if (!isPlaceholderKnockoutLabel(match.home_team)) {
      target.add(match.home_team);
    }
    if (!isPlaceholderKnockoutLabel(match.away_team)) {
      target.add(match.away_team);
    }
  };

  if (hasLegacyFinalRound(matches)) {
    for (const match of matches) {
      if (match.round === 8) {
        addTeams(thirdPlaceTeams, match);
      }
      if (match.round === 9) {
        addTeams(finalTeams, match);
      }
    }

    return {
      useSharedFinalRound: true,
      thirdPlaceTeams,
      finalTeams,
    };
  }

  const roundEightMatches = matches
    .filter((match) => match.round === 8)
    .sort((a, b) => {
      const kickoffA = a.kickoff_at ? new Date(a.kickoff_at).getTime() : Number.MAX_SAFE_INTEGER;
      const kickoffB = b.kickoff_at ? new Date(b.kickoff_at).getTime() : Number.MAX_SAFE_INTEGER;
      if (kickoffA !== kickoffB) {
        return kickoffA - kickoffB;
      }
      return a.match_id - b.match_id;
    });

  if (roundEightMatches.length >= 2) {
    addTeams(thirdPlaceTeams, roundEightMatches[0]);
    addTeams(finalTeams, roundEightMatches[roundEightMatches.length - 1]);

    return {
      useSharedFinalRound: true,
      thirdPlaceTeams,
      finalTeams,
    };
  }

  return {
    useSharedFinalRound: false,
    thirdPlaceTeams,
    finalTeams,
  };
}

function isTeamInSet(teamName: string | null | undefined, set: Set<string>) {
  if (!teamName) {
    return false;
  }
  return set.has(teamName);
}

function getLogicalRound(rawRound: number, useSharedFinalRound: boolean) {
  return useSharedFinalRound ? normalizeWkCompetitionRound(rawRound) : rawRound;
}

function scaleEventPoints(input: {
  rawRound: number;
  points: number;
  teamName: string | null | undefined;
  sharedFinalRound: SharedFinalRoundContext;
}) {
  if (input.sharedFinalRound.useSharedFinalRound && input.rawRound === 8 && isTeamInSet(input.teamName, input.sharedFinalRound.thirdPlaceTeams)) {
    return input.points / 2;
  }
  return input.points;
}

function buildMetadataMaps(rows: WkPlayerPointRow[], useSharedFinalRound: boolean) {
  const latestByPlayerId = new Map<number, WkPlayerPointRow>();
  const byPlayerRound = new Map<string, WkPlayerPointRow>();

  for (const row of rows) {
    const logicalRound = getLogicalRound(row.round, useSharedFinalRound);
    const roundKey = `${row.fantasyplayer_id}:${logicalRound}`;
    const existingRoundRow = byPlayerRound.get(roundKey);
    if (!existingRoundRow || row.round >= existingRoundRow.round) {
      byPlayerRound.set(roundKey, row);
    }

    const current = latestByPlayerId.get(row.fantasyplayer_id);
    if (!current || row.round >= current.round) {
      latestByPlayerId.set(row.fantasyplayer_id, row);
    }
  }

  return { latestByPlayerId, byPlayerRound };
}

function groupEventsByRoundAndPlayer(
  events: WkPlayerEventRow[],
  sharedFinalRound: SharedFinalRoundContext,
  byPlayerRound: Map<string, WkPlayerPointRow>,
  latestByPlayerId: Map<number, WkPlayerPointRow>,
) {
  const grouped = new Map<number, Map<number, PlayerPointEvent[]>>();
  for (const event of events) {
    const logicalRound = getLogicalRound(event.round, sharedFinalRound.useSharedFinalRound);
    const byPlayer = grouped.get(logicalRound) ?? new Map<number, PlayerPointEvent[]>();
    const playerEvents = byPlayer.get(event.fantasyplayer_id) ?? [];
    const teamName = event.team_name
      ?? byPlayerRound.get(`${event.fantasyplayer_id}:${logicalRound}`)?.team_name
      ?? latestByPlayerId.get(event.fantasyplayer_id)?.team_name
      ?? null;
    playerEvents.push({
      eventCode: event.event_code,
      points: scaleEventPoints({
        rawRound: event.round,
        points: event.points,
        teamName,
        sharedFinalRound,
      }),
      minute: event.minute,
    });
    byPlayer.set(event.fantasyplayer_id, playerEvents);
    grouped.set(logicalRound, byPlayer);
  }

  for (const byPlayer of grouped.values()) {
    for (const eventsForPlayer of byPlayer.values()) {
      eventsForPlayer.sort((a, b) => (a.minute ?? Number.MAX_SAFE_INTEGER) - (b.minute ?? Number.MAX_SAFE_INTEGER));
    }
  }

  return grouped;
}

function setRoundTeamBonus(map: Map<number, Map<string, number>>, round: number, teamName: string | null | undefined, bonus: number) {
  if (!teamName || isPlaceholderKnockoutLabel(teamName)) {
    return;
  }

  const byTeam = map.get(round) ?? new Map<string, number>();
  byTeam.set(teamName, Math.max(byTeam.get(teamName) ?? 0, bonus));
  map.set(round, byTeam);
}

function resolveMatchWinner(match: WkMatchRow) {
  if (match.home_score == null || match.away_score == null) {
    return null;
  }
  if (match.home_score > match.away_score) {
    return match.home_team;
  }
  if (match.away_score > match.home_score) {
    return match.away_team;
  }
  return null;
}

function buildAdvancementBonusByRoundAndTeam(input: {
  events: WkPlayerEventRow[];
  matches: WkMatchRow[];
  byPlayerRound: Map<string, WkPlayerPointRow>;
  latestByPlayerId: Map<number, WkPlayerPointRow>;
  sharedFinalRound: SharedFinalRoundContext;
}) {
  const bonusByRound = new Map<number, Map<string, number>>();
  const explicitAdvancementRounds = new Set<number>();

  for (const event of input.events) {
    if ((event.event_code ?? "").trim().toUpperCase() !== "MW") {
      continue;
    }

    const logicalRound = getLogicalRound(event.round, input.sharedFinalRound.useSharedFinalRound);
    explicitAdvancementRounds.add(logicalRound);
    const teamName = event.team_name
      ?? input.byPlayerRound.get(`${event.fantasyplayer_id}:${logicalRound}`)?.team_name
      ?? input.latestByPlayerId.get(event.fantasyplayer_id)?.team_name
      ?? null;
    const bonus = input.sharedFinalRound.useSharedFinalRound && event.round === 8 && isTeamInSet(teamName, input.sharedFinalRound.thirdPlaceTeams)
      ? THIRD_PLACE_ADVANCEMENT_BONUS
      : ADVANCEMENT_BONUS;
    setRoundTeamBonus(bonusByRound, logicalRound, teamName, bonus);
  }

  if (input.sharedFinalRound.useSharedFinalRound) {
    for (const match of input.matches) {
      if (match.round <= KNOCKOUT_START_ROUND) {
        continue;
      }
      if (match.round === 8) {
        continue;
      }

      const previousLogicalRound = match.round === 9 ? 7 : getLogicalRound(match.round - 1, true);
      if (explicitAdvancementRounds.has(previousLogicalRound)) {
        continue;
      }
      setRoundTeamBonus(bonusByRound, previousLogicalRound, match.home_team, ADVANCEMENT_BONUS);
      setRoundTeamBonus(bonusByRound, previousLogicalRound, match.away_team, ADVANCEMENT_BONUS);
    }

    if (!explicitAdvancementRounds.has(8)) {
      for (const match of input.matches) {
        const winner = resolveMatchWinner(match);
        if (!winner) {
          continue;
        }
        if (match.round === 8 && isTeamInSet(winner, input.sharedFinalRound.thirdPlaceTeams)) {
          setRoundTeamBonus(bonusByRound, 8, winner, THIRD_PLACE_ADVANCEMENT_BONUS);
        }
        if (match.round === 9 || (match.round === 8 && isTeamInSet(winner, input.sharedFinalRound.finalTeams))) {
          setRoundTeamBonus(bonusByRound, 8, winner, ADVANCEMENT_BONUS);
        }
      }
    }

    return bonusByRound;
  }

  for (const match of input.matches) {
    if (match.round <= KNOCKOUT_START_ROUND) {
      continue;
    }

    const previousRound = match.round - 1;
    if (explicitAdvancementRounds.has(previousRound)) {
      continue;
    }
    setRoundTeamBonus(bonusByRound, previousRound, match.home_team, ADVANCEMENT_BONUS);
    setRoundTeamBonus(bonusByRound, previousRound, match.away_team, ADVANCEMENT_BONUS);
  }

  return bonusByRound;
}

function calculateWkPlayerRoundAdvancementPoints(input: {
  round: number;
  teamName: string;
  bonusByRound: Map<number, Map<string, number>>;
}) {
  if (input.round < KNOCKOUT_START_ROUND) {
    return 0;
  }

  if (input.round === KNOCKOUT_START_ROUND) {
    return isTeamEliminated(input.teamName) ? 0 : ADVANCEMENT_BONUS;
  }

  return input.bonusByRound.get(input.round)?.get(input.teamName) ?? 0;
}

async function loadWkScoringInputs(effectiveRound: number) {
  const rawCeiling = expandWkCompetitionRoundForRawReads(effectiveRound) ?? effectiveRound;
  const [historyRows, events, matches] = await Promise.all([
    getWkPlayerPointHistory(rawCeiling),
    getWkPlayerEvents(),
    getWkMatches(),
  ]);
  const sharedFinalRound = buildSharedFinalRoundContext(matches);
  const relevantEvents = events.filter((event) => event.round <= rawCeiling);

  return {
    historyRows,
    relevantEvents,
    relevantMatches: matches,
    sharedFinalRound,
  };
}

export async function buildCalculatedWkPlayerPointsMap(maxRound?: number): Promise<Map<number, CalculatedWkPlayerPoints>> {
  const effectiveRound = typeof maxRound === "number" && Number.isInteger(maxRound) && maxRound > 0
    ? maxRound
    : (await getLatestSyncRound()) ?? 0;

  if (effectiveRound <= 0) {
    return new Map();
  }

  const { historyRows, relevantEvents, relevantMatches, sharedFinalRound } = await loadWkScoringInputs(effectiveRound);
  const { latestByPlayerId, byPlayerRound } = buildMetadataMaps(historyRows, sharedFinalRound.useSharedFinalRound);
  const groupedEvents = groupEventsByRoundAndPlayer(relevantEvents, sharedFinalRound, byPlayerRound, latestByPlayerId);
  const bonusByRound = buildAdvancementBonusByRoundAndTeam({
    events: relevantEvents,
    matches: relevantMatches,
    byPlayerRound,
    latestByPlayerId,
    sharedFinalRound,
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
        bonusByRound,
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

  const [calculated, previousCalculated] = await Promise.all([
    buildCalculatedWkPlayerPointsMap(effectiveRound),
    effectiveRound > 1 ? buildCalculatedWkPlayerPointsMap(effectiveRound - 1) : Promise.resolve(new Map<number, CalculatedWkPlayerPoints>()),
  ]);
  const result = new Map<number, number>();

  for (const [fantasyplayerId, summary] of calculated.entries()) {
    const previousTotal = previousCalculated.get(fantasyplayerId)?.totalPoints ?? 0;
    result.set(fantasyplayerId, summary.totalPoints - previousTotal);
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

  const calculated = await buildCalculatedWkPlayerPointsMap(effectiveRound);
  const previousCalculated = effectiveRound > 1 ? await buildCalculatedWkPlayerPointsMap(effectiveRound - 1) : new Map<number, CalculatedWkPlayerPoints>();
  const result = new Map<number, number>();

  for (const [fantasyplayerId, summary] of calculated.entries()) {
    const previousAdvancement = previousCalculated.get(fantasyplayerId)?.advancementPoints ?? 0;
    result.set(fantasyplayerId, summary.advancementPoints - previousAdvancement);
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

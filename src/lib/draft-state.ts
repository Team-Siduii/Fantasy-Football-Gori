import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { buildDraftPickSequence } from "../domain/rules";
import { addPlayerToTeamRoster, removePlayerFromTeamRoster, type TeamRosterScope } from "./team-roster-state";

export type DraftScope = TeamRosterScope;

export type DraftStatus = "IDLE" | "ACTIVE" | "COMPLETED";

export type DraftPick = {
  pickNumber: number;
  teamId: string;
  playerId: string;
  pickedAt: string;
};

export type DraftEvent = {
  type: "DRAFT_STARTED" | "PLAYER_PICKED" | "PLAYER_RETURNED";
  at: string;
  actorId: string;
  payload: Record<string, string | number>;
};

export type DraftState = {
  leagueId: string;
  status: DraftStatus;
  teamOrder: string[];
  totalRounds: number;
  totalPicks: number;
  pickSequence: string[];
  picks: DraftPick[];
  currentTurnTeamId: string | null;
  events: DraftEvent[];
};

const DEFAULT_DRAFT_STATE: DraftState = {
  leagueId: "default",
  status: "IDLE",
  teamOrder: [],
  totalRounds: 0,
  totalPicks: 0,
  pickSequence: [],
  picks: [],
  currentTurnTeamId: null,
  events: [],
};

export function resolveDraftStatePath(scope: DraftScope = "eredivisie") {
  if (scope === "wk" && process.env.DRAFT_STATE_WK_PATH) {
    return process.env.DRAFT_STATE_WK_PATH;
  }
  if (scope === "eredivisie" && process.env.DRAFT_STATE_PATH) {
    return process.env.DRAFT_STATE_PATH;
  }
  if (process.env.VERCEL) {
    return scope === "wk" ? "/tmp/draft-state-wk.json" : "/tmp/draft-state.json";
  }
  return path.join(process.cwd(), "data", scope === "wk" ? "draft-state-wk.json" : "draft-state.json");
}

export function readDraftState(scope: DraftScope = "eredivisie"): DraftState {
  const target = resolveDraftStatePath(scope);
  if (!existsSync(target)) {
    return { ...DEFAULT_DRAFT_STATE };
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as Partial<DraftState>;
    return {
      leagueId: typeof parsed.leagueId === "string" ? parsed.leagueId : "default",
      status: parsed.status === "ACTIVE" || parsed.status === "COMPLETED" ? parsed.status : "IDLE",
      teamOrder: Array.isArray(parsed.teamOrder) ? parsed.teamOrder.filter((s): s is string => typeof s === "string") : [],
      totalRounds: typeof parsed.totalRounds === "number" ? parsed.totalRounds : 0,
      totalPicks: typeof parsed.totalPicks === "number" ? parsed.totalPicks : 0,
      pickSequence: Array.isArray(parsed.pickSequence)
        ? parsed.pickSequence.filter((s): s is string => typeof s === "string")
        : [],
      picks: Array.isArray(parsed.picks)
        ? parsed.picks.filter(
            (p): p is DraftPick =>
              typeof p === "object" &&
              p !== null &&
              typeof (p as DraftPick).pickNumber === "number" &&
              typeof (p as DraftPick).teamId === "string" &&
              typeof (p as DraftPick).playerId === "string" &&
              typeof (p as DraftPick).pickedAt === "string",
          )
        : [],
      currentTurnTeamId: typeof parsed.currentTurnTeamId === "string" ? parsed.currentTurnTeamId : null,
      events: Array.isArray(parsed.events)
        ? parsed.events.filter(
            (e): e is DraftEvent =>
              typeof e === "object" &&
              e !== null &&
              typeof (e as DraftEvent).type === "string" &&
              typeof (e as DraftEvent).at === "string" &&
              typeof (e as DraftEvent).actorId === "string" &&
              typeof (e as DraftEvent).payload === "object" &&
              (e as DraftEvent).payload !== null,
          )
        : [],
    };
  } catch {
    return { ...DEFAULT_DRAFT_STATE };
  }
}

function writeDraftState(next: DraftState, scope: DraftScope = "eredivisie"): DraftState {
  const target = resolveDraftStatePath(scope);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

function computeCurrentTurnTeamId(pickSequence: string[], picksCount: number): string | null {
  return pickSequence[picksCount] ?? null;
}

export function startDraft(input: {
  leagueId: string;
  teamOrder: string[];
  totalRounds: number;
  startedBy: string;
  startedAt?: string;
  scope?: DraftScope;
}): DraftState {
  if (!Array.isArray(input.teamOrder) || input.teamOrder.length < 2) {
    throw new Error("teamOrder requires at least 2 teams");
  }
  if (!Number.isInteger(input.totalRounds) || input.totalRounds <= 0) {
    throw new Error("totalRounds must be a positive integer");
  }

  const totalPicks = input.teamOrder.length * input.totalRounds;
  const pickSequence = buildDraftPickSequence(input.teamOrder, totalPicks);
  const at = input.startedAt ?? new Date().toISOString();

  const scope = input.scope ?? "eredivisie";

  return writeDraftState({
    leagueId: input.leagueId,
    status: "ACTIVE",
    teamOrder: [...input.teamOrder],
    totalRounds: input.totalRounds,
    totalPicks,
    pickSequence,
    picks: [],
    currentTurnTeamId: computeCurrentTurnTeamId(pickSequence, 0),
    events: [
      {
        type: "DRAFT_STARTED",
        at,
        actorId: input.startedBy,
        payload: {
          totalPicks,
        },
      },
    ],
  }, scope);
}

export function registerPick(input: { teamId: string; playerId: string; at?: string; scope?: DraftScope }): DraftState {
  const scope = input.scope ?? "eredivisie";
  const current = readDraftState(scope);
  if (current.status !== "ACTIVE") {
    throw new Error("draft is not active");
  }
  if (current.currentTurnTeamId !== input.teamId) {
    throw new Error("not this team's turn");
  }
  if (current.picks.some((pick) => pick.playerId === input.playerId)) {
    throw new Error("player already picked");
  }

  const pickNumber = current.picks.length + 1;
  const at = input.at ?? new Date().toISOString();
  const nextPicks = [...current.picks, { pickNumber, teamId: input.teamId, playerId: input.playerId, pickedAt: at }];
  const status: DraftStatus = nextPicks.length >= current.totalPicks ? "COMPLETED" : "ACTIVE";

  const next: DraftState = {
    ...current,
    status,
    picks: nextPicks,
    currentTurnTeamId: status === "COMPLETED" ? null : computeCurrentTurnTeamId(current.pickSequence, nextPicks.length),
    events: [
      ...current.events,
      { type: "PLAYER_PICKED", at, actorId: input.teamId, payload: { pickNumber, playerId: input.playerId } },
    ],
  };

  addPlayerToTeamRoster(input.teamId, input.playerId, scope);

  return writeDraftState(next, scope);
}

export function returnPickedPlayerToPool(input: {
  teamId: string;
  playerId: string;
  reason: string;
  at?: string;
  scope?: DraftScope;
}): DraftState {
  const scope = input.scope ?? "eredivisie";
  const current = readDraftState(scope);
  const pickIndex = current.picks.findIndex((pick) => pick.teamId === input.teamId && pick.playerId === input.playerId);

  if (pickIndex === -1) {
    throw new Error("pick not found");
  }

  const at = input.at ?? new Date().toISOString();
  const nextPicks = current.picks
    .filter((_, idx) => idx !== pickIndex)
    .map((pick, idx) => ({ ...pick, pickNumber: idx + 1 }));

  const next: DraftState = {
    ...current,
    status: "ACTIVE",
    picks: nextPicks,
    currentTurnTeamId: computeCurrentTurnTeamId(current.pickSequence, nextPicks.length),
    events: [
      ...current.events,
      {
        type: "PLAYER_RETURNED",
        at,
        actorId: input.teamId,
        payload: { playerId: input.playerId, reason: input.reason },
      },
    ],
  };

  removePlayerFromTeamRoster(input.teamId, input.playerId, scope);

  return writeDraftState(next, scope);
}

export function resetDraftStateForTests(scope: DraftScope = "eredivisie") {
  writeDraftState({ ...DEFAULT_DRAFT_STATE }, scope);
}

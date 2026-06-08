import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { isGoriDatabaseEnabled, readPersistentJson, writePersistentJson } from "./persistent-json-store";
import { createClassicScoringProfile, getBackwardCompatibleDefaultProfile, type ScoringProfile } from "../domain/scoring-profiles";
import {
  createWaiverRound,
  type WaiverRound,
  type WaiverTieBreaker,
} from "../domain/waiver-mode";
import type { LeagueTableTieBreaker, KnockoutTiePolicy } from "../domain/competition-engine";
import { createDefaultRoleAssignments, type LeagueRoleAssignments } from "../domain/roles-permissions";
import { AUTH_TEST_ACCOUNT_PRESETS } from "./auth-test-accounts";

export type LeagueMode = "eredivisie" | "wk";

export type DraftMode = "admin" | "manager";

export type LeagueParticipantStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export type LeagueParticipant = {
  managerId: string;
  label: string;
  email: string;
  status: LeagueParticipantStatus;
};

export type LeagueCompetitionConfig = {
  name: string;
  formats: Array<"LEAGUE_TABLE" | "CUP_KNOCKOUT">;
  leagueTableTieBreakers: LeagueTableTieBreaker[];
  cupTiePolicy: KnockoutTiePolicy;
};

export type LeagueRuleNote = {
  id: string;
  title: string;
  description: string;
  impact: string;
};

export type LeagueAdminConfig = {
  scoringProfile: ScoringProfile;
  waiver: {
    enabled: boolean;
    round: WaiverRound;
  };
  budget: {
    teamValueCapMillions: number;
  };
  competition: LeagueCompetitionConfig;
  roles: LeagueRoleAssignments;
  draft: {
    totalRounds: number;
    mode: DraftMode;
  };
  participants: LeagueParticipant[];
  customRuleNotes: LeagueRuleNote[];
};

function normalizeMode(mode?: string): LeagueMode {
  return mode === "wk" ? "wk" : "eredivisie";
}

export function resolveLeagueAdminConfigPath(mode: LeagueMode = "eredivisie") {
  if (mode === "wk") {
    if (process.env.LEAGUE_ADMIN_CONFIG_WK_PATH) {
      return process.env.LEAGUE_ADMIN_CONFIG_WK_PATH;
    }

    if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
      return "/tmp/league-admin-config-wk.json";
    }

    return path.join(process.cwd(), "data", "league-admin-config-wk.json");
  }

  if (process.env.LEAGUE_ADMIN_CONFIG_PATH) {
    return process.env.LEAGUE_ADMIN_CONFIG_PATH;
  }

  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
    return "/tmp/league-admin-config.json";
  }

  return path.join(process.cwd(), "data", "league-admin-config.json");
}

function defaultBudgetCapForMode(mode: LeagueMode): number {
  return mode === "wk" ? 100 : 32;
}

function defaultCompetitionNameForMode(mode: LeagueMode): string {
  return mode === "wk" ? "WK 2026" : "Eredivisie 2025/2026";
}

function defaultParticipants(): LeagueParticipant[] {
  return AUTH_TEST_ACCOUNT_PRESETS.filter((account) => account.role === "manager").map((account) => ({
    managerId: account.id,
    label: account.label,
    email: account.email,
    status: "ACCEPTED",
  }));
}

function normalizeParticipantStatus(value: unknown): LeagueParticipantStatus {
  return value === "PENDING" || value === "REJECTED" ? value : "ACCEPTED";
}

function normalizeParticipants(input: unknown, fallback: LeagueParticipant[]): LeagueParticipant[] {
  if (!Array.isArray(input)) return fallback;

  return input
    .map((participant, index) => {
      const item = participant as Partial<LeagueParticipant>;
      const managerId = typeof item.managerId === "string" && item.managerId.trim() ? item.managerId.trim() : `manager-${index + 1}`;
      const fallbackMatch = fallback.find((candidate) => candidate.managerId === managerId);
      const label = typeof item.label === "string" && item.label.trim() ? item.label.trim() : fallbackMatch?.label ?? managerId;
      const email = typeof item.email === "string" && item.email.trim() ? item.email.trim() : fallbackMatch?.email ?? "";
      return {
        managerId,
        label,
        email,
        status: normalizeParticipantStatus(item.status),
      };
    })
    .filter((participant) => participant.managerId.length > 0 && participant.label.length > 0);
}

function defaultConfig(mode: LeagueMode): LeagueAdminConfig {
  return {
    scoringProfile: getBackwardCompatibleDefaultProfile(),
    waiver: {
      enabled: true,
      round: createWaiverRound({
        roundNumber: 5,
        tieBreaker: "PRIORITY",
        openedAt: new Date("2026-04-24T09:00:00.000Z").toISOString(),
        revealAt: new Date("2026-04-24T21:00:00.000Z").toISOString(),
      }),
    },
    budget: {
      teamValueCapMillions: defaultBudgetCapForMode(mode),
    },
    competition: {
      name: defaultCompetitionNameForMode(mode),
      formats: ["LEAGUE_TABLE", "CUP_KNOCKOUT"],
      leagueTableTieBreakers: ["GOAL_DIFFERENCE", "GOALS_FOR", "HEAD_TO_HEAD"],
      cupTiePolicy: "PENALTIES",
    },
    roles: createDefaultRoleAssignments("owner-1", ["manager-1"]),
    draft: {
      totalRounds: 15,
      mode: "admin" as DraftMode,
    },
    participants: defaultParticipants(),
    customRuleNotes: [],
  };
}

function normalize(input: Partial<LeagueAdminConfig>, mode: LeagueMode): LeagueAdminConfig {
  const base = defaultConfig(mode);

  const scoringProfile = input.scoringProfile ?? base.scoringProfile;
  const waiverRound = input.waiver?.round ?? base.waiver.round;
  const tieBreaker: WaiverTieBreaker =
    waiverRound.tieBreaker === "EARLIEST_BID" ? "EARLIEST_BID" : "PRIORITY";

  return {
    scoringProfile:
      scoringProfile.type === "CUSTOM"
        ? scoringProfile
        : createClassicScoringProfile(),
    waiver: {
      enabled: input.waiver?.enabled ?? base.waiver.enabled,
      round: {
        ...waiverRound,
        tieBreaker,
      },
    },
    budget: {
      teamValueCapMillions:
        typeof input.budget?.teamValueCapMillions === "number" && input.budget.teamValueCapMillions > 0
          ? input.budget.teamValueCapMillions
          : base.budget.teamValueCapMillions,
    },
    competition: {
      name:
        typeof input.competition?.name === "string" && input.competition.name.trim().length > 0
          ? input.competition.name.trim()
          : base.competition.name,
      formats: input.competition?.formats ?? base.competition.formats,
      leagueTableTieBreakers:
        input.competition?.leagueTableTieBreakers ?? base.competition.leagueTableTieBreakers,
      cupTiePolicy: input.competition?.cupTiePolicy ?? base.competition.cupTiePolicy,
    },
    roles: input.roles ?? base.roles,
    draft: {
      totalRounds:
        typeof input.draft?.totalRounds === "number" && Number.isInteger(input.draft.totalRounds) && input.draft.totalRounds > 0
          ? input.draft.totalRounds
          : base.draft.totalRounds,
      mode: input.draft?.mode === "manager" ? "manager" : base.draft.mode,
    },
    participants: normalizeParticipants(input.participants, base.participants),
    customRuleNotes: Array.isArray(input.customRuleNotes)
      ? input.customRuleNotes
          .map((note, index) => ({
            id: typeof note?.id === "string" && note.id.trim().length > 0 ? note.id.trim() : `custom-${index + 1}`,
            title: typeof note?.title === "string" ? note.title.trim() : "",
            description: typeof note?.description === "string" ? note.description.trim() : "",
            impact: typeof note?.impact === "string" ? note.impact.trim() : "",
          }))
          .filter((note) => note.title.length > 0 || note.description.length > 0 || note.impact.length > 0)
      : base.customRuleNotes,
  };
}

function save(config: LeagueAdminConfig, mode: LeagueMode) {
  const target = resolveLeagueAdminConfigPath(mode);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(config, null, 2), "utf-8");
}

export function getLeagueAdminConfig(modeInput?: string): LeagueAdminConfig {
  const mode = normalizeMode(modeInput);
  const target = resolveLeagueAdminConfigPath(mode);

  if (!existsSync(target)) {
    const config = defaultConfig(mode);
    save(config, mode);
    return config;
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as Partial<LeagueAdminConfig>;
    const config = normalize(parsed, mode);
    save(config, mode);
    return config;
  } catch {
    const config = defaultConfig(mode);
    save(config, mode);
    return config;
  }
}

export async function getLeagueAdminConfigPersistent(modeInput?: string): Promise<LeagueAdminConfig> {
  const mode = normalizeMode(modeInput);
  const fallback = getLeagueAdminConfig(mode);
  if (!isGoriDatabaseEnabled()) {
    return fallback;
  }
  const persisted = await readPersistentJson({ store: "league-admin-config", scope: mode }, fallback);
  const config = normalize(persisted, mode);
  save(config, mode);
  return config;
}

export function updateLeagueAdminConfig(next: Partial<LeagueAdminConfig>, modeInput?: string): LeagueAdminConfig {
  const mode = normalizeMode(modeInput);
  const current = getLeagueAdminConfig(mode);
  const merged = mergeLeagueAdminConfig(current, next, mode);

  save(merged, mode);
  return merged;
}

function mergeLeagueAdminConfig(
  current: LeagueAdminConfig,
  next: Partial<LeagueAdminConfig>,
  mode: LeagueMode,
): LeagueAdminConfig {
  return normalize({
    ...current,
    ...next,
    waiver: {
      ...current.waiver,
      ...next.waiver,
      round: {
        ...current.waiver.round,
        ...next.waiver?.round,
      },
    },
    budget: {
      ...current.budget,
      ...next.budget,
    },
    competition: {
      ...current.competition,
      ...next.competition,
    },
    roles: {
      ...current.roles,
      ...next.roles,
      commissionerIds: next.roles?.commissionerIds ?? current.roles.commissionerIds,
      managerIds: next.roles?.managerIds ?? current.roles.managerIds,
    },
    draft: {
      ...current.draft,
      ...next.draft,
    },
    participants: next.participants ?? current.participants,
    customRuleNotes: next.customRuleNotes ?? current.customRuleNotes,
  }, mode);
}

export async function updateLeagueAdminConfigPersistent(
  next: Partial<LeagueAdminConfig>,
  modeInput?: string,
): Promise<LeagueAdminConfig> {
  const mode = normalizeMode(modeInput);
  const current = await getLeagueAdminConfigPersistent(mode);
  const merged = mergeLeagueAdminConfig(current, next, mode);
  save(merged, mode);
  if (isGoriDatabaseEnabled()) {
    await writePersistentJson({ store: "league-admin-config", scope: mode }, merged);
  }
  return merged;
}

export function resetLeagueAdminConfigForTests(modeInput?: string) {
  const target = resolveLeagueAdminConfigPath(normalizeMode(modeInput));
  if (existsSync(target)) {
    unlinkSync(target);
  }
}

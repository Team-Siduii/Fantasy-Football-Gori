import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { createClassicScoringProfile, getBackwardCompatibleDefaultProfile, type ScoringProfile } from "../domain/scoring-profiles";
import {
  createWaiverRound,
  type WaiverRound,
  type WaiverTieBreaker,
} from "../domain/waiver-mode";
import type { LeagueTableTieBreaker, KnockoutTiePolicy } from "../domain/competition-engine";
import { createDefaultRoleAssignments, type LeagueRoleAssignments } from "../domain/roles-permissions";

export type LeagueCompetitionConfig = {
  formats: Array<"LEAGUE_TABLE" | "CUP_KNOCKOUT">;
  leagueTableTieBreakers: LeagueTableTieBreaker[];
  cupTiePolicy: KnockoutTiePolicy;
};

export type LeagueAdminConfig = {
  scoringProfile: ScoringProfile;
  waiver: {
    enabled: boolean;
    round: WaiverRound;
  };
  competition: LeagueCompetitionConfig;
  roles: LeagueRoleAssignments;
};

function getConfigPath() {
  return process.env.LEAGUE_ADMIN_CONFIG_PATH || path.join(process.cwd(), "data", "league-admin-config.json");
}

function defaultConfig(): LeagueAdminConfig {
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
    competition: {
      formats: ["LEAGUE_TABLE", "CUP_KNOCKOUT"],
      leagueTableTieBreakers: ["GOAL_DIFFERENCE", "GOALS_FOR", "HEAD_TO_HEAD"],
      cupTiePolicy: "PENALTIES",
    },
    roles: createDefaultRoleAssignments("owner-1", ["manager-1"]),
  };
}

function normalize(input: Partial<LeagueAdminConfig>): LeagueAdminConfig {
  const base = defaultConfig();

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
    competition: {
      formats: input.competition?.formats ?? base.competition.formats,
      leagueTableTieBreakers:
        input.competition?.leagueTableTieBreakers ?? base.competition.leagueTableTieBreakers,
      cupTiePolicy: input.competition?.cupTiePolicy ?? base.competition.cupTiePolicy,
    },
    roles: input.roles ?? base.roles,
  };
}

function save(config: LeagueAdminConfig) {
  const target = getConfigPath();
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(config, null, 2), "utf-8");
}

export function getLeagueAdminConfig(): LeagueAdminConfig {
  const target = getConfigPath();

  if (!existsSync(target)) {
    const config = defaultConfig();
    save(config);
    return config;
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as Partial<LeagueAdminConfig>;
    const config = normalize(parsed);
    save(config);
    return config;
  } catch {
    const config = defaultConfig();
    save(config);
    return config;
  }
}

export function updateLeagueAdminConfig(next: Partial<LeagueAdminConfig>): LeagueAdminConfig {
  const current = getLeagueAdminConfig();
  const merged = normalize({
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
  });

  save(merged);
  return merged;
}

export function resetLeagueAdminConfigForTests() {
  const target = getConfigPath();
  if (existsSync(target)) {
    unlinkSync(target);
  }
}

import { existsSync } from "fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getLeagueAdminConfig,
  resetLeagueAdminConfigForTests,
  resolveLeagueAdminConfigPath,
  updateLeagueAdminConfig,
} from "../../src/lib/league-admin-config";

describe("league admin config", () => {
  beforeEach(() => {
    process.env.LEAGUE_ADMIN_CONFIG_PATH = "/tmp/ffg-league-admin-config-ered.test.json";
    process.env.LEAGUE_ADMIN_CONFIG_WK_PATH = "/tmp/ffg-league-admin-config-wk.test.json";
    resetLeagueAdminConfigForTests("eredivisie");
    resetLeagueAdminConfigForTests("wk");
  });

  it("heeft default config met classic scoring", () => {
    const config = getLeagueAdminConfig("eredivisie");

    expect(config.scoringProfile.id).toBe("classic");
    expect(config.waiver.round.status).toBe("OPEN");
    expect(config.competition.formats).toEqual(["LEAGUE_TABLE", "CUP_KNOCKOUT"]);
  });

  it("kan waiver tiebreaker en roles updaten", () => {
    const current = getLeagueAdminConfig("eredivisie");

    const updated = updateLeagueAdminConfig(
      {
        waiver: {
          ...current.waiver,
          round: {
            ...current.waiver.round,
            tieBreaker: "EARLIEST_BID",
          },
        },
        roles: {
          ownerId: "owner-1",
          commissionerIds: ["owner-1", "comm-1"],
          managerIds: ["owner-1", "manager-1"],
        },
      },
      "eredivisie",
    );

    expect(updated.waiver.round.tieBreaker).toBe("EARLIEST_BID");
    expect(updated.roles.commissionerIds).toContain("comm-1");
  });

  it("slaat eredivisie en wk config apart op", () => {
    const wk = updateLeagueAdminConfig(
      {
        competition: {
          ...getLeagueAdminConfig("wk").competition,
          cupTiePolicy: "HIGHER_SEED",
        },
      },
      "wk",
    );

    const eredivisie = getLeagueAdminConfig("eredivisie");

    expect(wk.competition.cupTiePolicy).toBe("HIGHER_SEED");
    expect(eredivisie.competition.cupTiePolicy).toBe("PENALTIES");
    expect(resolveLeagueAdminConfigPath("wk")).not.toBe(resolveLeagueAdminConfigPath("eredivisie"));
  });

  it("gebruikt /tmp defaults op Vercel als geen expliciete config paden zijn gezet", () => {
    delete process.env.LEAGUE_ADMIN_CONFIG_PATH;
    delete process.env.LEAGUE_ADMIN_CONFIG_WK_PATH;
    process.env.VERCEL = "1";

    resetLeagueAdminConfigForTests("eredivisie");
    resetLeagueAdminConfigForTests("wk");

    const eredivisieConfig = getLeagueAdminConfig("eredivisie");
    const wkConfig = getLeagueAdminConfig("wk");

    expect(eredivisieConfig.scoringProfile.id).toBe("classic");
    expect(wkConfig.scoringProfile.id).toBe("classic");
    expect(existsSync("/tmp/league-admin-config.json")).toBe(true);
    expect(existsSync("/tmp/league-admin-config-wk.json")).toBe(true);

    delete process.env.VERCEL;
    process.env.LEAGUE_ADMIN_CONFIG_PATH = "/tmp/ffg-league-admin-config-ered.test.json";
    process.env.LEAGUE_ADMIN_CONFIG_WK_PATH = "/tmp/ffg-league-admin-config-wk.test.json";
    resetLeagueAdminConfigForTests("eredivisie");
    resetLeagueAdminConfigForTests("wk");
  });
});

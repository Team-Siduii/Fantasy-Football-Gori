import { beforeEach, describe, expect, it } from "vitest";
import {
  getLeagueAdminConfig,
  resetLeagueAdminConfigForTests,
  updateLeagueAdminConfig,
} from "../../src/lib/league-admin-config";

describe("league admin config", () => {
  beforeEach(() => {
    process.env.LEAGUE_ADMIN_CONFIG_PATH = "/tmp/ffg-league-admin-config.test.json";
    resetLeagueAdminConfigForTests();
  });

  it("heeft default config met classic scoring", () => {
    const config = getLeagueAdminConfig();

    expect(config.scoringProfile.id).toBe("classic");
    expect(config.waiver.round.status).toBe("OPEN");
    expect(config.competition.formats).toEqual(["LEAGUE_TABLE", "CUP_KNOCKOUT"]);
  });

  it("kan waiver tiebreaker en roles updaten", () => {
    const updated = updateLeagueAdminConfig({
      waiver: {
        ...getLeagueAdminConfig().waiver,
        round: {
          ...getLeagueAdminConfig().waiver.round,
          tieBreaker: "EARLIEST_BID",
        },
      },
      roles: {
        ownerId: "owner-1",
        commissionerIds: ["owner-1", "comm-1"],
        managerIds: ["owner-1", "manager-1"],
      },
    });

    expect(updated.waiver.round.tieBreaker).toBe("EARLIEST_BID");
    expect(updated.roles.commissionerIds).toContain("comm-1");
  });
});

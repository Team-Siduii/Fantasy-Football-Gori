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

  it("heeft mode-specifieke default config met classic scoring en budget", () => {
    const eredivisie = getLeagueAdminConfig("eredivisie");
    const wk = getLeagueAdminConfig("wk");

    expect(eredivisie.scoringProfile.id).toBe("classic");
    expect(eredivisie.waiver.round.status).toBe("OPEN");
    expect(eredivisie.competition.formats).toEqual(["LEAGUE_TABLE", "CUP_KNOCKOUT"]);
    expect(eredivisie.budget.teamValueCapMillions).toBe(32);
    expect(wk.budget.teamValueCapMillions).toBe(100);
  });

  it("heeft standaard een competitienaam, draft rondes en accepteerbare manager-deelnemers", () => {
    const wk = getLeagueAdminConfig("wk");

    expect(wk.competition.name).toBe("WK 2026");
    expect(wk.draft.totalRounds).toBe(15);
    expect(wk.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ managerId: "johan-swart", label: "Johan Swart", status: "ACCEPTED" }),
        expect.objectContaining({ managerId: "thomas-bart", label: "Thomas", status: "ACCEPTED" }),
      ]),
    );
  });

  it("bouwt draft setup alleen uit geaccepteerde deelnemers", () => {
    const updated = updateLeagueAdminConfig(
      {
        competition: {
          ...getLeagueAdminConfig("wk").competition,
          name: "WK Familie Poule",
        },
        draft: { totalRounds: 12, mode: "admin" },
        participants: [
          { managerId: "johan-swart", label: "Johan Swart", email: "Johan201@hotmail.com", status: "ACCEPTED" },
          { managerId: "thomas-bart", label: "Thomas", email: "Thomasbart91@gmail.com", status: "REJECTED" },
          { managerId: "jack-van-der-reep", label: "Jack", email: "Jackvandereep@hotmail.com", status: "PENDING" },
          { managerId: "emiel-zomerdijk", label: "Emiel Zomerdijk", email: "emielzomerdijk@gmail.com", status: "ACCEPTED" },
        ],
      },
      "wk",
    );

    expect(updated.competition.name).toBe("WK Familie Poule");
    expect(updated.draft.totalRounds).toBe(12);
    expect(updated.participants.slice(0, 4).map((participant) => participant.status)).toEqual(["ACCEPTED", "REJECTED", "PENDING", "ACCEPTED"]);
    expect(updated.participants.filter((participant) => participant.status === "ACCEPTED").map((participant) => participant.label)).toEqual(
      expect.arrayContaining(["Johan Swart", "Emiel Zomerdijk"]),
    );
  });

  it("kan waiver tiebreaker, budget en roles updaten", () => {
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
        budget: {
          teamValueCapMillions: 40,
        },
        customRuleNotes: [
          {
            id: "rule-1",
            title: "Minimaal 1 keeper",
            description: "Elke opstelling moet exact 1 keeper bevatten.",
            impact: "Ongeldige opstellingen worden geweigerd bij opslaan.",
          },
        ],
        roles: {
          ownerId: "owner-1",
          commissionerIds: ["owner-1", "comm-1"],
          managerIds: ["owner-1", "manager-1"],
        },
      },
      "eredivisie",
    );

    expect(updated.waiver.round.tieBreaker).toBe("EARLIEST_BID");
    expect(updated.budget.teamValueCapMillions).toBe(40);
    expect(updated.customRuleNotes).toHaveLength(1);
    expect(updated.customRuleNotes[0]?.title).toBe("Minimaal 1 keeper");
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

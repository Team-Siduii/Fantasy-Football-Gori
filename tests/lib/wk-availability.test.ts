import { describe, expect, it } from "vitest";
import { applyWkPlayerAvailabilityAndPoints, buildActiveWkTeamsForRound } from "../../src/lib/wk-availability";

describe("wk availability", () => {
  it("treats finale and troostfinale teams together as active in shared round 8", () => {
    const activeTeams = buildActiveWkTeamsForRound([
      {
        match_id: 101,
        round: 8,
        home_team: "Engeland",
        away_team: "Frankrijk",
        home_team_code: "ENG",
        away_team_code: "FRA",
        home_score: null,
        away_score: null,
        status: "NS",
        minute: null,
        kickoff_at: "2026-07-18T19:00:00Z",
        synced_at: "2026-07-18T12:00:00Z",
      },
      {
        match_id: 102,
        round: 9,
        home_team: "Argentinië",
        away_team: "Spanje",
        home_team_code: "ARG",
        away_team_code: "ESP",
        home_score: null,
        away_score: null,
        status: "NS",
        minute: null,
        kickoff_at: "2026-07-19T19:00:00Z",
        synced_at: "2026-07-18T12:00:00Z",
      },
    ], 8);

    expect(activeTeams).toEqual(new Set(["engeland", "frankrijk", "argentinie", "spanje"]));
  });

  it("grays out everyone outside the four active round-8 teams while keeping active teams selectable", () => {
    const players = applyWkPlayerAvailabilityAndPoints({
      csvPlayers: [
        { id: "1", naam: "Messi", positie: "FWD", club: "Argentinië", prijs: 15 },
        { id: "2", naam: "Mbappé", positie: "FWD", club: "Frankrijk", prijs: 15 },
        { id: "3", naam: "Musiala", positie: "MID", club: "Duitsland", prijs: 14 },
      ],
      matches: [
        {
          match_id: 101,
          round: 8,
          home_team: "Engeland",
          away_team: "Frankrijk",
          home_team_code: "ENG",
          away_team_code: "FRA",
          home_score: null,
          away_score: null,
          status: "NS",
          minute: null,
          kickoff_at: "2026-07-18T19:00:00Z",
          synced_at: "2026-07-18T12:00:00Z",
        },
        {
          match_id: 102,
          round: 9,
          home_team: "Argentinië",
          away_team: "Spanje",
          home_team_code: "ARG",
          away_team_code: "ESP",
          home_score: null,
          away_score: null,
          status: "NS",
          minute: null,
          kickoff_at: "2026-07-19T19:00:00Z",
          synced_at: "2026-07-18T12:00:00Z",
        },
      ],
      roundNumber: 8,
    });

    expect(players[0]).toMatchObject({ isActive: true, inactive: false });
    expect(players[1]).toMatchObject({ isActive: true, inactive: false });
    expect(players[2]).toMatchObject({ isActive: false, inactive: true });
  });
});

import { describe, expect, it } from "vitest";
import { mapTheSportsDbEventsToNormalized, type TheSportsDbEvent } from "../../src/lib/data-sources/thesportsdb";

describe("theSportsDB adapter", () => {
  it("maps scores and event strings to normalized events", () => {
    const events: TheSportsDbEvent[] = [
      {
        idEvent: "100",
        strHomeTeam: "Nederland",
        strAwayTeam: "Frankrijk",
        intHomeScore: "2",
        intAwayScore: "1",
        strTimestamp: "2026-06-14T19:00:00+00:00",
        strHomeGoalDetails: "12:Depay;80:Simons",
        strAwayGoalDetails: "67:Mbappe",
        strHomeYellowCards: "55:Aké",
        strAwayYellowCards: "45:Tchouameni",
        strAwayRedCards: "82:Upamecano",
        strHomeLineupGoalkeeper: "Verbruggen",
      },
    ];

    const normalized = mapTheSportsDbEventsToNormalized(events);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].scoreFT).toEqual({ home: 2, away: 1 });
    expect(normalized[0].events.filter((event) => event.type === "goal")).toHaveLength(3);
    expect(normalized[0].events.some((event) => event.type === "yellow_card")).toBe(true);
    expect(normalized[0].events.some((event) => event.type === "red_card")).toBe(true);
    expect(normalized[0].events.some((event) => event.type === "goalkeeper_save")).toBe(true);
  });
});

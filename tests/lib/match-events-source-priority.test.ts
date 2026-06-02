import { describe, expect, it } from "vitest";
import { buildMatchEventsSourcePriority } from "../../src/lib/data-sources/match-events-source-priority";

describe("match events source priority", () => {
  it("keeps WKCoach as top priority for player points when Flashfootball is enabled", () => {
    expect(buildMatchEventsSourcePriority({ includeFlashfootball: true })).toEqual({
      score: "flashfootball>openligadb>thesportsdb",
      goals: "flashfootball>openligadb>thesportsdb",
      assists: "flashfootball>thesportsdb>openligadb",
      saves: "thesportsdb>openligadb",
      cards: "flashfootball>thesportsdb>openligadb",
      playerPoints: "wkcoach(primary)>fallback",
    });
  });

  it("keeps the existing fallback priority when Flashfootball is not requested", () => {
    expect(buildMatchEventsSourcePriority({ includeFlashfootball: false }).playerPoints).toBe("wkcoach(primary)>fallback");
    expect(buildMatchEventsSourcePriority({ includeFlashfootball: false }).goals).toBe("openligadb>thesportsdb");
  });
});

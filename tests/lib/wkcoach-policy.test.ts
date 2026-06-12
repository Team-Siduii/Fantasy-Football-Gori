import { describe, expect, it } from "vitest";
import {
  buildWkcoachCoordinatorAlert,
  getPlayerPointsPriority,
  isLeagueCoordinator,
  shouldUseWkcoachByDefault,
} from "../../src/lib/data-sources/wkcoach-policy";

describe("wkcoach policy", () => {
  it("treats wkcoach as primary by default when query param is missing", () => {
    expect(shouldUseWkcoachByDefault(null)).toBe(true);
  });

  it("allows explicitly disabling wkcoach with includeWkcoach=false", () => {
    expect(shouldUseWkcoachByDefault("false")).toBe(false);
  });

  it("reports wkcoach as truth source for player points", () => {
    expect(getPlayerPointsPriority()).toBe("wkcoach(primary)>fallback");
  });

  it("flags only Simon as league coordinator", () => {
    expect(isLeagueCoordinator("s.j.m.duindam@gmail.com")).toBe(true);
    expect(isLeagueCoordinator("other@gori.local")).toBe(false);
  });

  it("returns coordinator-only warning when wkcoach truth pipeline is unavailable", () => {
    const coordinatorAlert = buildWkcoachCoordinatorAlert({
      email: "s.j.m.duindam@gmail.com",
      wkcoachRequested: true,
      wkcoachEnabled: false,
      hasCredentials: false,
    });

    const nonCoordinatorAlert = buildWkcoachCoordinatorAlert({
      email: "manager@gori.local",
      wkcoachRequested: true,
      wkcoachEnabled: false,
      hasCredentials: false,
    });

    expect(coordinatorAlert).toMatchObject({
      show: true,
      message: expect.stringContaining("WKCoach is primaire waarheid"),
    });
    expect(nonCoordinatorAlert).toBeNull();
  });
});

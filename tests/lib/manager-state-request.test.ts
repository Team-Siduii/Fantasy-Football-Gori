import { describe, expect, it } from "vitest";
import { buildManagerStateRequestUrl } from "../../src/lib/manager-state-request";

describe("buildManagerStateRequestUrl", () => {
  it("requests the selected WK round snapshot even when it is the current round", () => {
    expect(
      buildManagerStateRequestUrl({
        mode: "wk",
        selectedRound: 6,
        currentRound: 6,
        cacheBust: 123,
      }),
    ).toBe("/api/manager/state?mode=wk&roundNumber=6&_t=123");
  });

  it("requests the selected historical WK round snapshot", () => {
    expect(
      buildManagerStateRequestUrl({
        mode: "wk",
        selectedRound: 4,
        currentRound: 6,
        cacheBust: 456,
      }),
    ).toBe("/api/manager/state?mode=wk&roundNumber=4&_t=456");
  });

  it("keeps eredivisie requests on the top-level state endpoint", () => {
    expect(
      buildManagerStateRequestUrl({
        mode: "eredivisie",
        selectedRound: 12,
        currentRound: 12,
        cacheBust: 789,
      }),
    ).toBe("/api/manager/state?mode=eredivisie&_t=789");
  });
});

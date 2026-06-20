import { describe, expect, it } from "vitest";

import { createLatestRequestTracker } from "../../src/lib/latest-request";

describe("createLatestRequestTracker", () => {
  it("invalidates an older in-flight request after a newer request starts", () => {
    const tracker = createLatestRequestTracker();

    const roundTwoRequest = tracker.begin();
    const roundOneRequest = tracker.begin();

    expect(tracker.isActive(roundTwoRequest)).toBe(false);
    expect(tracker.isActive(roundOneRequest)).toBe(true);
  });

  it("does not allow an aborted request to apply even if it was latest", () => {
    const tracker = createLatestRequestTracker();
    const requestId = tracker.begin();

    expect(tracker.isActive(requestId, true)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { resolvePreferredManagerRouteFromCounts } from "../../src/lib/manager-entry-route";

describe("manager entry route", () => {
  it("opens WK when only WK has a populated team", () => {
    expect(resolvePreferredManagerRouteFromCounts({ eredivisieCount: 0, wkCount: 15 })).toBe("/manager/world-cup");
  });

  it("stays on Eredivisie when eredivisie has players", () => {
    expect(resolvePreferredManagerRouteFromCounts({ eredivisieCount: 15, wkCount: 15 })).toBe("/manager/my-team");
    expect(resolvePreferredManagerRouteFromCounts({ eredivisieCount: 15, wkCount: 0 })).toBe("/manager/my-team");
  });

  it("keeps current default when both modes are empty", () => {
    expect(resolvePreferredManagerRouteFromCounts({ eredivisieCount: 0, wkCount: 0 })).toBe("/manager/my-team");
  });
});

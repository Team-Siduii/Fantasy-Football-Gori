import { describe, expect, it } from "vitest";
import { resolveModeFallbackPath, resolvePreferredManagerRouteFromCounts } from "../../src/lib/manager-route-utils";

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

  it("redirects a WK-only manager from empty eredivisie routes to the WK mirror route", () => {
    expect(resolveModeFallbackPath({ currentPath: "/manager/my-team", eredivisieCount: 0, wkCount: 15 })).toBe("/manager/world-cup");
    expect(resolveModeFallbackPath({ currentPath: "/draft", eredivisieCount: 0, wkCount: 15 })).toBe("/manager/world-cup/draft");
    expect(resolveModeFallbackPath({ currentPath: "/manager/league", eredivisieCount: 0, wkCount: 15 })).toBe("/manager/world-cup/league");
  });

  it("does not redirect when the current mode already has players", () => {
    expect(resolveModeFallbackPath({ currentPath: "/manager/my-team", eredivisieCount: 15, wkCount: 15 })).toBeNull();
    expect(resolveModeFallbackPath({ currentPath: "/manager/world-cup", eredivisieCount: 0, wkCount: 15 })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { shouldShowWkAdvancementBadge } from "../../src/lib/wk-advancement-badge";

describe("shouldShowWkAdvancementBadge", () => {
  it("shows advancement badges for knockout rounds from round 3 onward", () => {
    expect(shouldShowWkAdvancementBadge(3, 5)).toBe(true);
    expect(shouldShowWkAdvancementBadge(6, 5)).toBe(true);
  });

  it("hides advancement badges before knockout rounds or without advancement points", () => {
    expect(shouldShowWkAdvancementBadge(2, 5)).toBe(false);
    expect(shouldShowWkAdvancementBadge(null, 5)).toBe(false);
    expect(shouldShowWkAdvancementBadge(6, 0)).toBe(false);
  });
});

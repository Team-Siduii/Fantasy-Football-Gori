import { describe, expect, it } from "vitest";
import {
  getPlayerPointsPriority,
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
});

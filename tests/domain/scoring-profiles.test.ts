import { describe, expect, it } from "vitest";
import {
  createClassicScoringProfile,
  createCustomScoringProfile,
  getBackwardCompatibleDefaultProfile,
  validateScoringProfile,
} from "../../src/domain/scoring-profiles";

describe("scoring profiles", () => {
  it("heeft backward-compatible classic als default", () => {
    const profile = getBackwardCompatibleDefaultProfile();
    expect(profile.id).toBe("classic");
    expect(profile.type).toBe("CLASSIC");
    expect(profile.points.goal).toBeGreaterThan(0);
  });

  it("accepteert custom bonus/malus parameters", () => {
    const profile = createCustomScoringProfile({
      id: "aggressive",
      label: "Aggressive",
      points: {
        goal: 6,
        assist: 4,
        cleanSheetGKDEF: 5,
        yellowCard: -1,
        redCard: -3,
      },
    });

    const result = validateScoringProfile(profile);
    expect(result.isValid).toBe(true);
  });

  it("weigert custom profiel met positieve malus", () => {
    const profile = createClassicScoringProfile();
    const invalid = {
      ...profile,
      id: "broken",
      type: "CUSTOM" as const,
      points: {
        ...profile.points,
        yellowCard: 2,
      },
    };

    const result = validateScoringProfile(invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("points.yellowCard must be <= 0");
  });
});

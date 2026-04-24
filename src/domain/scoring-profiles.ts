export type ScoringProfileType = "CLASSIC" | "CUSTOM";

export type ScoringPoints = {
  goal: number;
  assist: number;
  cleanSheetGKDEF: number;
  yellowCard: number;
  redCard: number;
};

export type ScoringProfile = {
  id: string;
  label: string;
  type: ScoringProfileType;
  points: ScoringPoints;
};

export type ScoringProfileValidationResult = {
  isValid: boolean;
  errors: string[];
};

const CLASSIC_POINTS: ScoringPoints = {
  goal: 5,
  assist: 3,
  cleanSheetGKDEF: 4,
  yellowCard: -1,
  redCard: -3,
};

export function createClassicScoringProfile(): ScoringProfile {
  return {
    id: "classic",
    label: "Classic",
    type: "CLASSIC",
    points: { ...CLASSIC_POINTS },
  };
}

export function getBackwardCompatibleDefaultProfile(): ScoringProfile {
  return createClassicScoringProfile();
}

export function createCustomScoringProfile(input: {
  id: string;
  label: string;
  points: ScoringPoints;
}): ScoringProfile {
  return {
    id: input.id,
    label: input.label,
    type: "CUSTOM",
    points: { ...input.points },
  };
}

export function validateScoringProfile(profile: unknown): ScoringProfileValidationResult {
  const errors: string[] = [];

  if (!profile || typeof profile !== "object") {
    return { isValid: false, errors: ["profile must be an object"] };
  }

  const candidate = profile as Partial<ScoringProfile>;
  if (typeof candidate.id !== "string" || candidate.id.trim() === "") {
    errors.push("id is required");
  }

  if (typeof candidate.label !== "string" || candidate.label.trim() === "") {
    errors.push("label is required");
  }

  if (candidate.type !== "CLASSIC" && candidate.type !== "CUSTOM") {
    errors.push("type must be CLASSIC or CUSTOM");
  }

  const points = candidate.points;
  if (!points || typeof points !== "object") {
    errors.push("points is required");
  } else {
    const numericKeys: Array<keyof ScoringPoints> = ["goal", "assist", "cleanSheetGKDEF", "yellowCard", "redCard"];
    for (const key of numericKeys) {
      if (typeof points[key] !== "number" || Number.isNaN(points[key])) {
        errors.push(`points.${key} must be a number`);
      }
    }

    if (typeof points.yellowCard === "number" && points.yellowCard > 0) {
      errors.push("points.yellowCard must be <= 0");
    }

    if (typeof points.redCard === "number" && points.redCard > 0) {
      errors.push("points.redCard must be <= 0");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

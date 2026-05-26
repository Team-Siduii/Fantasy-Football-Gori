import { describe, expect, it } from "vitest";
import { getPlayerCardDesignConcepts } from "../../src/lib/player-card-designs";

describe("getPlayerCardDesignConcepts", () => {
  it("returns exactly four design concepts including a recommended modern variant", () => {
    const concepts = getPlayerCardDesignConcepts();

    expect(concepts).toHaveLength(4);
    expect(concepts.map((c) => c.id)).toEqual([
      "modern-minimal",
      "dark-data",
      "panini-classic",
      "dynamic-action",
    ]);

    const recommended = concepts.find((c) => c.recommended);
    expect(recommended?.id).toBe("modern-minimal");
  });
});

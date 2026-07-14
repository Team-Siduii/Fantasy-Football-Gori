import { describe, expect, it } from "vitest";

import { preservePendingSellVisibility } from "../../src/lib/pending-sell-visibility";

describe("preservePendingSellVisibility", () => {
  it("keeps a pending-sell player visible in the saved squad", () => {
    const state = {
      lineup: [
        { id: "gk-1", naam: "Keeper" },
        { id: "mid-7", naam: "Noni Madueke" },
      ],
      bench: [{ id: "def-2", naam: "Bench Defender" }],
    };

    const result = preservePendingSellVisibility(state, "mid-7");

    expect(result.lineup.map((player) => player.id)).toEqual(["gk-1", "mid-7"]);
    expect(result.bench.map((player) => player.id)).toEqual(["def-2"]);
    expect([...result.lineup, ...result.bench].some((player) => player.id.startsWith("open-"))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { canPersistManagerRoundState } from "../../src/lib/manager-round-persistence";

describe("canPersistManagerRoundState", () => {
  it("blocks persistence while a newly selected round is still hydrating", () => {
    expect(
      canPersistManagerRoundState({
        hydrated: true,
        suppressNextPersist: false,
        isRoundHydrating: true,
        lineupIds: ["253", "444"],
        benchIds: [],
        persistRound: 7,
        hydratedRound: 6,
      }),
    ).toBe(false);
  });

  it("blocks persistence when the visible state provenance does not match the selected round", () => {
    expect(
      canPersistManagerRoundState({
        hydrated: true,
        suppressNextPersist: false,
        isRoundHydrating: false,
        lineupIds: ["253", "444"],
        benchIds: [],
        persistRound: 7,
        hydratedRound: 6,
      }),
    ).toBe(false);
  });

  it("allows persistence only after the hydrated round matches the selected round", () => {
    expect(
      canPersistManagerRoundState({
        hydrated: true,
        suppressNextPersist: false,
        isRoundHydrating: false,
        lineupIds: ["253", "444", "1319"],
        benchIds: ["362"],
        persistRound: 7,
        hydratedRound: 7,
      }),
    ).toBe(true);
  });
});

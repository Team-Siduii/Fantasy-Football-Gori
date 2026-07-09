import { describe, expect, it } from "vitest";
import {
  allRequiredBuyChoicesSubmitted,
  createTransferRoundState,
  resolveSubmittedBuys,
  skipSellChoice,
  submitBuyChoice,
  submitSellChoice,
} from "../../src/domain/transfer-round";

const participants = [
  {
    managerId: "alpha",
    email: "alpha@gori.local",
    displayName: "Alpha",
    teamName: "Alpha FC",
    subpoule: "A",
    rankingPosition: 1,
  },
  {
    managerId: "beta",
    email: "beta@gori.local",
    displayName: "Beta",
    teamName: "Beta FC",
    subpoule: "A",
    rankingPosition: 4,
  },
  {
    managerId: "gamma",
    email: "gamma@gori.local",
    displayName: "Gamma",
    teamName: "Gamma FC",
    subpoule: "A",
    rankingPosition: 6,
  },
];

describe("transfer-round", () => {
  it("moves from sell phase to buy phase when all managers made a sell/skip choice", () => {
    let state = createTransferRoundState(1, participants);
    state = submitSellChoice(state, "alpha", "sold-1");
    state = skipSellChoice(state, "beta");
    expect(state.phase).toBe("SELL");

    state = submitSellChoice(state, "gamma", "sold-2");
    expect(state.phase).toBe("BUY");
    expect(state.entries.find((entry) => entry.managerId === "beta")?.buyStatus).toBe("LOCKED");
  });

  it("marks lower-ranked manager as winner on duplicate buy choice", () => {
    let state = createTransferRoundState(1, participants);
    state = submitSellChoice(state, "alpha", "sold-1");
    state = submitSellChoice(state, "beta", "sold-2");
    state = skipSellChoice(state, "gamma");

    state = submitBuyChoice(state, "alpha", ["target-1"]);
    state = submitBuyChoice(state, "beta", ["target-1"]);
    expect(allRequiredBuyChoicesSubmitted(state)).toBe(true);

    state = resolveSubmittedBuys(state);

    const alpha = state.entries.find((entry) => entry.managerId === "alpha");
    const beta = state.entries.find((entry) => entry.managerId === "beta");

    expect(beta?.buyStatus).toBe("COMPLETED");
    expect(beta?.resolvedTransfers).toEqual([{ soldPlayerId: "sold-2", boughtPlayerId: "target-1" }]);
    expect(alpha?.buyStatus).toBe("RETRY_REQUIRED");
    expect(alpha?.resolvedTransfers).toEqual([]);
    expect(state.phase).toBe("AWAITING_RETRY");
    expect(state.conflicts[0]).toMatchObject({ winnerManagerId: "beta", loserManagerIds: ["alpha"] });
  });

  it("completes the round after retry picks are resolved", () => {
    let state = createTransferRoundState(1, participants);
    state = submitSellChoice(state, "alpha", "sold-1");
    state = submitSellChoice(state, "beta", "sold-2");
    state = skipSellChoice(state, "gamma");
    state = submitBuyChoice(state, "alpha", ["target-1"]);
    state = submitBuyChoice(state, "beta", ["target-1"]);
    state = resolveSubmittedBuys(state);

    state = submitBuyChoice(state, "alpha", ["target-2"]);
    state = resolveSubmittedBuys(state);

    expect(state.phase).toBe("COMPLETED");
    expect(state.entries.find((entry) => entry.managerId === "alpha")?.resolvedTransfers).toEqual([
      {
        soldPlayerId: "sold-1",
        boughtPlayerId: "target-2",
      },
    ]);
  });

  it("keeps winning buys and retries only the lost duplicate slot", () => {
    let state = createTransferRoundState(1, participants);
    state = {
      ...state,
      entries: state.entries.map((entry) =>
        entry.managerId === "alpha"
          ? { ...entry, autoSellPlayerIds: ["sold-auto-1"] }
          : entry,
      ),
    };
    state = submitSellChoice(state, "alpha", "sold-manual-1");
    state = submitSellChoice(state, "beta", "sold-2");
    state = skipSellChoice(state, "gamma");

    state = submitBuyChoice(state, "alpha", ["target-shared", "target-safe"]);
    state = submitBuyChoice(state, "beta", ["target-shared"]);
    state = resolveSubmittedBuys(state);

    const alphaAfterConflict = state.entries.find((entry) => entry.managerId === "alpha");
    const betaAfterConflict = state.entries.find((entry) => entry.managerId === "beta");

    expect(alphaAfterConflict?.buyStatus).toBe("RETRY_REQUIRED");
    expect(alphaAfterConflict?.resolvedTransfers).toEqual([
      { soldPlayerId: "sold-manual-1", boughtPlayerId: "target-safe" },
    ]);
    expect(betaAfterConflict?.buyStatus).toBe("COMPLETED");
    expect(betaAfterConflict?.resolvedTransfers).toEqual([{ soldPlayerId: "sold-2", boughtPlayerId: "target-shared" }]);
  });
});

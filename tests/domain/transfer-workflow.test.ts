import { describe, expect, it } from "vitest";
import {
  applyConfirmedTransfer,
  buildMarketPlayers,
  canPickIncomingPlayer,
  filterTransferMarketPlayers,
  type TransferState,
} from "../../src/domain/transfer-workflow";
import type { PlayerRecord } from "../../src/domain/player";

const allPlayers: PlayerRecord[] = [
  { id: "1", naam: "Keeper A", positie: "GK", club: "AJA", prijs: 5 },
  { id: "2", naam: "Def A", positie: "DEF", club: "PSV", prijs: 6 },
  { id: "3", naam: "Mid A", positie: "MID", club: "FEY", prijs: 7 },
  { id: "4", naam: "Mid B", positie: "MID", club: "AZ", prijs: 8 },
  { id: "5", naam: "Fwd A", positie: "FWD", club: "UTR", prijs: 9 },
];

const baseState: TransferState = {
  lineupIds: ["1", "2", "3"],
  benchIds: ["5"],
  pendingSellId: null,
  pendingBuyId: null,
};

describe("transfer workflow", () => {
  it("marks current squad players as owned instead of filtering them out", () => {
    const market = buildMarketPlayers(allPlayers, baseState.lineupIds, baseState.benchIds);

    expect(market.map((player) => ({ id: player.id, owned: player.owned ?? false }))).toEqual([
      { id: "1", owned: true },
      { id: "2", owned: true },
      { id: "3", owned: true },
      { id: "4", owned: false },
      { id: "5", owned: true },
    ]);
  });

  it("keeps inactive market players visible while still filtering blocked player ids", () => {
    const market = buildMarketPlayers(
      [
        ...allPlayers,
        { id: "6", naam: "Out Player", positie: "FWD", club: "OUT", prijs: 4, punten: 0, inactive: true },
      ],
      baseState.lineupIds,
      baseState.benchIds,
    );

    const visible = filterTransferMarketPlayers(market, ["4"]);

    expect(visible.map((player) => player.id)).toContain("6");
    expect(visible.find((player) => player.id === "6")).toMatchObject({ inactive: true, owned: false });
    expect(visible.map((player) => player.id)).not.toContain("4");
  });

  it("requires a selected outgoing player before choosing incoming player", () => {
    expect(canPickIncomingPlayer(baseState)).toBe(false);
    expect(canPickIncomingPlayer({ ...baseState, pendingSellId: "3" })).toBe(true);
  });

  it("confirms transfer by replacing outgoing player in same zone", () => {
    const next = applyConfirmedTransfer(
      {
        ...baseState,
        pendingSellId: "3",
        pendingBuyId: "4",
      },
      allPlayers,
    );

    expect(next.lineupIds).toEqual(["1", "2", "4"]);
    expect(next.benchIds).toEqual(["5"]);
    expect(next.pendingSellId).toBeNull();
    expect(next.pendingBuyId).toBeNull();
  });

  it("rejects confirmation when incoming and outgoing positions differ", () => {
    const next = applyConfirmedTransfer(
      {
        ...baseState,
        pendingSellId: "2",
        pendingBuyId: "4",
      },
      allPlayers,
    );

    expect(next).toEqual({
      ...baseState,
      pendingSellId: "2",
      pendingBuyId: "4",
    });
  });
});

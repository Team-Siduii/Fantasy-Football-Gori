import { describe, expect, it } from "vitest";
import { validateTransferSquad } from "../../src/domain/transfer-validation";
import type { PlayerRecord } from "../../src/domain/player";

function player(input: Partial<PlayerRecord> & Pick<PlayerRecord, "id" | "naam" | "positie" | "club" | "prijs">): PlayerRecord {
  return {
    punten: 0,
    ...input,
  };
}

describe("transfer-validation", () => {
  it("blocks transfers that exceed the budget cap", () => {
    expect(() =>
      validateTransferSquad({
        rosterPlayers: [
          player({ id: "1", naam: "A", positie: "GK", club: "NL", prijs: 20 }),
          player({ id: "2", naam: "B", positie: "DEF", club: "DE", prijs: 20 }),
        ],
        incomingPlayer: player({ id: "3", naam: "C", positie: "DEF", club: "FR", prijs: 25 }),
        soldPlayerId: "2",
        budgetCap: 40,
      }),
    ).toThrow("Transfer geblokkeerd");
  });

  it("blocks transfers above max two players per country", () => {
    expect(() =>
      validateTransferSquad({
        rosterPlayers: [
          player({ id: "1", naam: "A", positie: "GK", club: "NL", prijs: 5 }),
          player({ id: "2", naam: "B", positie: "DEF", club: "NL", prijs: 5 }),
          player({ id: "3", naam: "C", positie: "MID", club: "DE", prijs: 5 }),
        ],
        incomingPlayer: player({ id: "4", naam: "D", positie: "FWD", club: "NL", prijs: 5 }),
        soldPlayerId: "3",
        budgetCap: 30,
      }),
    ).toThrow("maximaal 2 spelers per land toegestaan");
  });
});

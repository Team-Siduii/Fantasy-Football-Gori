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

  it("blocks transfers above max two players per country outside WK rounds 7 and 8", () => {
    expect(() =>
      validateTransferSquad({
        rosterPlayers: [
          player({ id: "1", naam: "A", positie: "GK", club: "NL", prijs: 5 }),
          player({ id: "2", naam: "B", positie: "DEF", club: "NL", prijs: 5 }),
          player({ id: "3", naam: "C", positie: "MID", club: "DE", prijs: 5 }),
          player({ id: "4", naam: "D", positie: "MID", club: "FR", prijs: 5 }),
          player({ id: "5", naam: "E", positie: "DEF", club: "ES", prijs: 5 }),
          player({ id: "6", naam: "F", positie: "DEF", club: "PT", prijs: 5 }),
          player({ id: "7", naam: "G", positie: "DEF", club: "IT", prijs: 5 }),
          player({ id: "8", naam: "H", positie: "MID", club: "BE", prijs: 5 }),
          player({ id: "9", naam: "I", positie: "MID", club: "AR", prijs: 5 }),
          player({ id: "10", naam: "J", positie: "FWD", club: "BR", prijs: 5 }),
          player({ id: "11", naam: "K", positie: "FWD", club: "EN", prijs: 5 }),
          player({ id: "12", naam: "L", positie: "GK", club: "US", prijs: 5 }),
        ],
        incomingPlayer: player({ id: "13", naam: "M", positie: "FWD", club: "NL", prijs: 5 }),
        soldPlayerId: "10",
        budgetCap: 80,
        scope: "wk",
        roundNumber: 6,
      }),
    ).toThrow("maximaal 2 spelers per land toegestaan");
  });

  it("allows country stacking in WK round 7", () => {
    expect(() =>
      validateTransferSquad({
        rosterPlayers: [
          player({ id: "1", naam: "A", positie: "GK", club: "NL", prijs: 5 }),
          player({ id: "2", naam: "B", positie: "DEF", club: "NL", prijs: 5 }),
          player({ id: "3", naam: "C", positie: "MID", club: "DE", prijs: 5 }),
          player({ id: "4", naam: "D", positie: "MID", club: "FR", prijs: 5 }),
          player({ id: "5", naam: "E", positie: "DEF", club: "ES", prijs: 5 }),
          player({ id: "6", naam: "F", positie: "DEF", club: "PT", prijs: 5 }),
          player({ id: "7", naam: "G", positie: "DEF", club: "IT", prijs: 5 }),
          player({ id: "8", naam: "H", positie: "MID", club: "BE", prijs: 5 }),
          player({ id: "9", naam: "I", positie: "MID", club: "AR", prijs: 5 }),
          player({ id: "10", naam: "J", positie: "FWD", club: "BR", prijs: 5 }),
          player({ id: "11", naam: "K", positie: "FWD", club: "EN", prijs: 5 }),
          player({ id: "12", naam: "L", positie: "GK", club: "US", prijs: 5 }),
        ],
        incomingPlayer: player({ id: "13", naam: "M", positie: "FWD", club: "NL", prijs: 5 }),
        soldPlayerId: "10",
        budgetCap: 80,
        scope: "wk",
        roundNumber: 7,
      }),
    ).not.toThrow();
  });
});

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

  it("blocks transfers above max two players per country in wk mode", () => {
    expect(() =>
      validateTransferSquad({
        scope: "wk",
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

  it("blocks eredivisie transfers above max one player per club", () => {
    expect(() =>
      validateTransferSquad({
        scope: "eredivisie",
        rosterPlayers: [
          player({ id: "1", naam: "Ajax Keeper", positie: "GK", club: "Ajax", prijs: 5 }),
          player({ id: "2", naam: "PSV Def", positie: "DEF", club: "PSV", prijs: 5 }),
          player({ id: "3", naam: "AZ Mid", positie: "MID", club: "AZ", prijs: 5 }),
        ],
        incomingPlayer: player({ id: "4", naam: "Ajax Aanvaller", positie: "FWD", club: "Ajax", prijs: 5 }),
        soldPlayerId: "3",
        budgetCap: 30,
      }),
    ).toThrow("maximaal 1 speler per club toegestaan");
  });

  it("keeps enforcing a viable formation plus bench coverage during transfers", () => {
    expect(() =>
      validateTransferSquad({
        rosterPlayers: [
          player({ id: "gk-1", naam: "Keeper", positie: "GK", club: "Argentinië", prijs: 5 }),
          player({ id: "def-1", naam: "Def 1", positie: "DEF", club: "Brazilië", prijs: 5 }),
          player({ id: "def-2", naam: "Def 2", positie: "DEF", club: "Spanje", prijs: 5 }),
          player({ id: "def-3", naam: "Def 3", positie: "DEF", club: "Frankrijk", prijs: 5 }),
          player({ id: "mid-1", naam: "Mid 1", positie: "MID", club: "Engeland", prijs: 5 }),
          player({ id: "mid-2", naam: "Mid 2", positie: "MID", club: "Portugal", prijs: 5 }),
          player({ id: "mid-3", naam: "Mid 3", positie: "MID", club: "Duitsland", prijs: 5 }),
          player({ id: "mid-4", naam: "Mid 4", positie: "MID", club: "België", prijs: 5 }),
          player({ id: "fwd-1", naam: "Fwd 1", positie: "FWD", club: "Nederland", prijs: 5 }),
          player({ id: "bench-gk", naam: "Bench GK", positie: "GK", club: "Spanje", prijs: 4 }),
          player({ id: "bench-mid", naam: "Bench MID", positie: "MID", club: "Frankrijk", prijs: 4 }),
          player({ id: "bench-fwd", naam: "Bench FWD", positie: "FWD", club: "Argentinië", prijs: 4 }),
          player({ id: "bench-def", naam: "Bench DEF", positie: "DEF", club: "Engeland", prijs: 4 }),
          player({ id: "extra-def", naam: "Extra DEF", positie: "DEF", club: "Italië", prijs: 4 }),
          player({ id: "sell-def", naam: "Sell DEF", positie: "DEF", club: "Mexico", prijs: 4 }),
        ],
        incomingPlayer: player({ id: "extra-mid", naam: "Extra MID", positie: "MID", club: "Uruguay", prijs: 4 }),
        soldPlayerId: "sell-def",
        budgetCap: 100,
      }),
    ).toThrow("formatie");
  });
});

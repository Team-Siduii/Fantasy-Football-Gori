import { describe, expect, it } from "vitest";
import { parsePlayerCsv } from "../../src/domain/player-csv";

describe("parsePlayerCsv", () => {
  it("parses semicolon CSV with required fields", () => {
    const csv = [
      "id;naam;club;positie;prijs",
      "1;Hancko;Feyenoord;DEF;7.5",
      "2;Taylor;Ajax;MID;8.0",
    ].join("\n");

    const result = parsePlayerCsv(csv);

    expect(result.players).toHaveLength(2);
    expect(result.players[0]).toEqual({
      id: "1",
      naam: "Hancko",
      club: "Feyenoord",
      positie: "DEF",
      prijs: 7.5,
    });
  });

  it("parses comma CSV with required fields", () => {
    const csv = [
      "id,naam,club,positie,prijs",
      "3,Pasveer,Ajax,GK,4.5",
    ].join("\n");

    const result = parsePlayerCsv(csv);

    expect(result.players).toHaveLength(1);
    expect(result.players[0].positie).toBe("GK");
  });

  it("parses Coach van het Jaar header names and normalizes values", () => {
    const csv = [
      "speler id,speler naam,positie,club,transferwaarde",
      "1011,Mathijs Menu,Verdediger,AZ,1000000",
      "383,Gonzalo Crettaz,Keeper,NEC,1750000",
      "140,Koki Ogawa,Aanvaller,NEC,2250000",
    ].join("\n");

    const result = parsePlayerCsv(csv);

    expect(result.players).toHaveLength(3);
    expect(result.players[0]).toEqual({
      id: "1011",
      naam: "Mathijs Menu",
      club: "AZ",
      positie: "DEF",
      prijs: 1,
    });
    expect(result.players[1].positie).toBe("GK");
    expect(result.players[2].positie).toBe("FWD");
  });

  it("throws when a required header is missing", () => {
    const csv = [
      "id;naam;club;positie",
      "1;Hancko;Feyenoord;DEF",
    ].join("\n");

    expect(() => parsePlayerCsv(csv)).toThrow(/prijs/i);
  });
});

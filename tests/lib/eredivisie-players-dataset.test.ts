import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parsePlayerCsv } from "../../src/domain/player-csv";

describe("Eredivisie spelersdataset", () => {
  it("laadt de Coach van het Jaar 2026/2027 spelerspool met actieve status en 18 clubs", () => {
    const csv = readFileSync(path.join(process.cwd(), "data", "players.csv"), "utf-8");
    const { players } = parsePlayerCsv(csv);

    expect(players).toHaveLength(473);
    expect(new Set(players.map((player) => player.club))).toHaveLength(18);
    expect(players.every((player) => ["GK", "DEF", "MID", "FWD"].includes(player.positie))).toBe(true);
    expect(players.some((player) => player.club === "ADO Den Haag")).toBe(true);
    expect(players.some((player) => player.club === "Cambuur")).toBe(true);
    expect(players.some((player) => player.club === "Willem II")).toBe(true);
    expect(players.every((player) => typeof player.isActive === "boolean")).toBe(true);
    expect(players.map((player) => player.naam)).not.toEqual(
      expect.arrayContaining(["Demo Keeper", "Demo Def 1", "Demo Mid 1", "Demo Fwd 1"]),
    );
  });
});

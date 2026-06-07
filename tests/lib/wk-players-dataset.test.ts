import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parsePlayerCsv } from "../../src/domain/player-csv";

describe("WK spelersdataset", () => {
  it("laadt de definitieve actieve WKCoach selecties voor 48 landen", () => {
    const csv = readFileSync(path.join(process.cwd(), "data", "players-wk.csv"), "utf-8");
    const { players } = parsePlayerCsv(csv);

    expect(players).toHaveLength(1244);
    expect(new Set(players.map((player) => player.club))).toHaveLength(48);
    expect(players.map((player) => player.id)).not.toEqual(expect.arrayContaining(["1294", "1303", "1305", "1313", "1326", "1383", "801", "862", "1072", "1204"]));
    expect(players.every((player) => ["GK", "DEF", "MID", "FWD"].includes(player.positie))).toBe(true);
  });
});

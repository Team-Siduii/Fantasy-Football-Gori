import { describe, expect, it } from "vitest";
import { countTeamsByConfederation, WORLD_CUP_2026_PHASES, WORLD_CUP_2026_TEAMS } from "../../src/lib/world-cup-2026";

describe("world-cup-2026", () => {
  it("contains 48 teams including 3 hosts", () => {
    expect(WORLD_CUP_2026_TEAMS).toHaveLength(48);

    const hosts = WORLD_CUP_2026_TEAMS.filter((team) => team.qualification === "Host").map((team) => team.name).sort();
    expect(hosts).toEqual(["Canada", "Mexico", "United States"]);
  });

  it("exposes confederation counts and a 104-match phase schedule", () => {
    const counts = countTeamsByConfederation(WORLD_CUP_2026_TEAMS);
    const totalTeams = [...counts.values()].reduce((sum, amount) => sum + amount, 0);
    const totalMatches = WORLD_CUP_2026_PHASES.reduce((sum, phase) => sum + phase.matchCount, 0);

    expect(totalTeams).toBe(48);
    expect(totalMatches).toBe(104);
    expect(WORLD_CUP_2026_PHASES[0]?.phase).toBe("Groepsfase");
    expect(WORLD_CUP_2026_PHASES[WORLD_CUP_2026_PHASES.length - 1]?.phase).toBe("Finale");
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("manager my-team topbar", () => {
  const pagePath = path.join(process.cwd(), "src", "app", "manager", "my-team", "page.tsx");
  const source = readFileSync(pagePath, "utf-8");

  it("shows total points before round points in the top bar", () => {
    const totalIndex = source.indexOf('<span>Totaal punten</span>');
    const roundIndex = source.indexOf('<span>Ronde punten</span>');
    const budgetIndex = source.indexOf('<span>Resterende waarde</span>');

    expect(totalIndex).toBeGreaterThan(-1);
    expect(roundIndex).toBeGreaterThan(totalIndex);
    expect(budgetIndex).toBeGreaterThan(roundIndex);
  });

  it("uses the server-provided team totals instead of a local-only squad sum when available", () => {
    expect(source).toContain('if (typeof teamTotalPoints === "number")');
    expect(source).toContain('if (typeof teamCurrentRoundPoints === "number")');
    expect(source).toContain('<strong>{displayTeamTotalPoints}</strong>');
    expect(source).toContain('<strong>{displayTeamRoundPoints}</strong>');
  });
});

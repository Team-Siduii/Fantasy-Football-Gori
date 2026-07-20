import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("manager league page layout", () => {
  const pagePath = path.join(process.cwd(), "src", "app", "manager", "league", "page.tsx");
  const source = readFileSync(pagePath, "utf-8");

  it("renders a dedicated action column directly after the team column", () => {
    const teamHeaderIndex = source.indexOf('className="league-col league-col--team">Team</div>');
    const actionHeaderIndex = source.indexOf('className="league-col league-col--action">Actie</div>');

    expect(teamHeaderIndex).toBeGreaterThan(-1);
    expect(actionHeaderIndex).toBeGreaterThan(teamHeaderIndex);
  });

  it("uses a compact view button instead of a full-width team card action", () => {
    expect(source).toContain('className="league-view-button"');
    expect(source).toContain('<span>Bekijk</span>');
    expect(source).toContain('<span aria-hidden="true">→</span>');
    expect(source).not.toContain('btn btn-secondary btn-small');
  });

  it("keeps five leaderboard columns on mobile so action, round points, and total points stay on one row", () => {
    const globalsPath = path.join(process.cwd(), "src", "app", "globals.css");
    const globalsSource = readFileSync(globalsPath, "utf-8");

    expect(globalsSource).toContain("@media (max-width: 620px)");
    expect(globalsSource).toContain("grid-template-columns: 2rem minmax(0, 1fr) max-content max-content max-content;");
    expect(globalsSource).not.toContain("grid-template-columns: 2rem minmax(0, 1fr) auto auto;");
  });

  it("shows summary pills and an own-team badge for quick leaderboard scanning", () => {
    expect(source).toContain('className="league-summary-pill__label">Teams</span>');
    expect(source).toContain('className="league-summary-pill__label">Jouw plek</span>');
    expect(source).toContain('className="league-team-badge">Jij</span>');
  });
});

import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCanonicalManagerIdentities,
  buildManagerIdentityScopeKey,
  normalizeManagerIdentityEmail,
  resolveCanonicalManagerId,
} from "../src/lib/manager-identity";
import { readTeamRosterState, saveTeamRosterState } from "../src/lib/team-roster-state";

describe("manager identity helpers", () => {
  const tempDirs: string[] = [];
  const previousRosterPath = process.env.TEAM_ROSTER_STATE_WK_PATH;

  afterEach(() => {
    process.env.TEAM_ROSTER_STATE_WK_PATH = previousRosterPath;
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("normalizes manager emails before they participate in identity scope", () => {
    expect(normalizeManagerIdentityEmail("  EmielZomerdijk@GMAIL.com ")).toBe("emielzomerdijk@gmail.com");
  });

  it("returns null for missing or blank emails", () => {
    expect(normalizeManagerIdentityEmail(undefined)).toBeNull();
    expect(normalizeManagerIdentityEmail(null)).toBeNull();
    expect(normalizeManagerIdentityEmail("   ")).toBeNull();
  });

  it("produces different scope keys for different logged-in managers", () => {
    expect(buildManagerIdentityScopeKey("wk", "s.j.m.duindam@gmail.com")).toBe("wk:s.j.m.duindam@gmail.com");
    expect(buildManagerIdentityScopeKey("wk", "emielzomerdijk@gmail.com")).toBe("wk:emielzomerdijk@gmail.com");
    expect(buildManagerIdentityScopeKey("wk", "s.j.m.duindam@gmail.com")).not.toBe(
      buildManagerIdentityScopeKey("wk", "emielzomerdijk@gmail.com"),
    );
  });

  it("resolves participant labels and emails onto one canonical managerId", () => {
    expect(resolveCanonicalManagerId("wk", "Thomas")).toBe("thomas-bart");
    expect(resolveCanonicalManagerId("wk", "Thomasbart91@gmail.com")).toBe("thomas-bart");
    expect(resolveCanonicalManagerId("wk", "thomas-bart")).toBe("thomas-bart");
  });

  it("builds alias sets that keep legacy labels compatible with canonical ids", () => {
    const thomasIdentity = buildCanonicalManagerIdentities("wk").find(
      (identity) => identity.canonicalManagerId === "thomas-bart",
    );

    expect(thomasIdentity).toBeTruthy();
    expect(thomasIdentity?.aliases.has("thomas")).toBe(true);
    expect(thomasIdentity?.aliases.has("thomasbart91@gmail.com")).toBe(true);
    expect(thomasIdentity?.aliases.has("thomas-bart")).toBe(true);
  });

  it("merges legacy roster keys into the canonical managerId on save/read", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "manager-identity-roster-"));
    tempDirs.push(dir);
    process.env.TEAM_ROSTER_STATE_WK_PATH = path.join(dir, "team-roster-state-wk.json");

    const saved = saveTeamRosterState(
      {
        byTeamId: {
          Thomas: ["old-thomas", "shared-player"],
          "thomas-bart": ["new-thomas", "shared-player"],
          "Thomasbart91@gmail.com": ["mail-thomas"],
        },
      },
      "wk",
    );

    expect(saved.byTeamId).toEqual({
      "thomas-bart": ["old-thomas", "shared-player", "new-thomas", "mail-thomas"],
    });
    expect(readTeamRosterState("wk").byTeamId).toEqual(saved.byTeamId);
  });
});

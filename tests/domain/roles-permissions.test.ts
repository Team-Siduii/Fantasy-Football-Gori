import { describe, expect, it } from "vitest";
import {
  canPerform,
  createDefaultRoleAssignments,
  type LeaguePermission,
} from "../../src/domain/roles-permissions";

describe("rollenmodel owner/commissioner/manager", () => {
  it("kan standaard rollen toewijzen", () => {
    const assignments = createDefaultRoleAssignments("owner-1", ["manager-1", "manager-2"]);

    expect(assignments.ownerId).toBe("owner-1");
    expect(assignments.commissionerIds).toContain("owner-1");
    expect(assignments.managerIds).toContain("manager-1");
  });

  it("enforced permission matrix voor admin overrides", () => {
    const assignments = createDefaultRoleAssignments("owner-1", ["manager-1"]);
    const permission: LeaguePermission = "ADMIN_OVERRIDE";

    expect(canPerform(assignments, "owner-1", permission)).toBe(true);
    expect(canPerform(assignments, "manager-1", permission)).toBe(false);
  });
});

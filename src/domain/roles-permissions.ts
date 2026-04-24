export type LeagueRole = "OWNER" | "COMMISSIONER" | "MANAGER";

export type LeaguePermission =
  | "ADMIN_OVERRIDE"
  | "MANAGE_ROUNDS"
  | "MANAGE_RULES"
  | "MANAGE_SCORING_PROFILE"
  | "MANAGE_COMPETITIONS"
  | "MANAGE_MEMBERS"
  | "MANAGE_OWN_TEAM";

export type LeagueRoleAssignments = {
  ownerId: string;
  commissionerIds: string[];
  managerIds: string[];
};

const PERMISSIONS: Record<LeagueRole, LeaguePermission[]> = {
  OWNER: [
    "ADMIN_OVERRIDE",
    "MANAGE_ROUNDS",
    "MANAGE_RULES",
    "MANAGE_SCORING_PROFILE",
    "MANAGE_COMPETITIONS",
    "MANAGE_MEMBERS",
    "MANAGE_OWN_TEAM",
  ],
  COMMISSIONER: [
    "MANAGE_ROUNDS",
    "MANAGE_RULES",
    "MANAGE_SCORING_PROFILE",
    "MANAGE_COMPETITIONS",
    "MANAGE_MEMBERS",
    "MANAGE_OWN_TEAM",
  ],
  MANAGER: ["MANAGE_OWN_TEAM"],
};

export function createDefaultRoleAssignments(ownerId: string, managerIds: string[]): LeagueRoleAssignments {
  const uniqueManagers = Array.from(new Set([ownerId, ...managerIds]));
  return {
    ownerId,
    commissionerIds: [ownerId],
    managerIds: uniqueManagers,
  };
}

export function resolveRole(assignments: LeagueRoleAssignments, managerId: string): LeagueRole {
  if (managerId === assignments.ownerId) {
    return "OWNER";
  }

  if (assignments.commissionerIds.includes(managerId)) {
    return "COMMISSIONER";
  }

  return "MANAGER";
}

export function canPerform(
  assignments: LeagueRoleAssignments,
  managerId: string,
  permission: LeaguePermission,
): boolean {
  const role = resolveRole(assignments, managerId);
  return PERMISSIONS[role].includes(permission);
}

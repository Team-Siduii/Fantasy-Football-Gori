import { canPerform, type LeaguePermission } from "@/domain/roles-permissions";
import { getLeagueAdminConfig } from "@/lib/league-admin-config";

export function resolveActorIdFromRequest(request: Request): string {
  const header = request.headers.get("x-manager-id")?.trim();
  return header && header.length > 0 ? header : "owner-1";
}

export function hasLeaguePermission(actorId: string, permission: LeaguePermission): boolean {
  const config = getLeagueAdminConfig();
  return canPerform(config.roles, actorId, permission);
}

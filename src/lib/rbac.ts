import { canPerform, type LeaguePermission } from "@/domain/roles-permissions";
import { getLeagueAdminConfigPersistent } from "@/lib/league-admin-config";

export function resolveActorIdFromRequest(request: Request): string {
  const header = request.headers.get("x-manager-id")?.trim();
  return header && header.length > 0 ? header : "owner-1";
}

export async function hasLeaguePermission(actorId: string, permission: LeaguePermission): Promise<boolean> {
  const config = await getLeagueAdminConfigPersistent();
  return canPerform(config.roles, actorId, permission);
}

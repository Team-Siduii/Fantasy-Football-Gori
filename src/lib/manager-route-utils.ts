const MODE_SWITCH_ROUTES: Record<string, string> = {
  "/draft": "/manager/world-cup/draft",
  "/manager/my-team": "/manager/world-cup",
  "/manager/transfer-pool": "/manager/world-cup/transfer-pool",
  "/manager/league": "/manager/world-cup/league",
  "/manager/view-team": "/manager/world-cup/view-team",
  "/manager/world-cup/draft": "/draft",
  "/manager/world-cup": "/manager/my-team",
  "/manager/world-cup/transfer-pool": "/manager/transfer-pool",
  "/manager/world-cup/league": "/manager/league",
  "/manager/world-cup/view-team": "/manager/view-team",
};

export function hasModeSwitchRoute(pathname: string) {
  return pathname in MODE_SWITCH_ROUTES;
}

export function countPlayers(lineupIds: string[] = [], benchIds: string[] = []) {
  return [...lineupIds, ...benchIds].filter((id) => typeof id === "string" && id.trim().length > 0).length;
}

export function resolvePreferredManagerRouteFromCounts(input: { eredivisieCount: number; wkCount: number }) {
  if (input.wkCount > 0 && input.eredivisieCount === 0) {
    return "/manager/world-cup";
  }

  return "/manager/my-team";
}

export function resolveModeFallbackPath(input: { currentPath: string; eredivisieCount: number; wkCount: number }) {
  const alternatePath = MODE_SWITCH_ROUTES[input.currentPath];
  if (!alternatePath) {
    return null;
  }

  const currentIsWkMode = input.currentPath.startsWith("/manager/world-cup");
  const currentModeCount = currentIsWkMode ? input.wkCount : input.eredivisieCount;
  const alternateModeCount = currentIsWkMode ? input.eredivisieCount : input.wkCount;

  if (currentModeCount === 0 && alternateModeCount > 0) {
    return alternatePath;
  }

  return null;
}

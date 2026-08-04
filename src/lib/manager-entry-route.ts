import { countPlayers, resolvePreferredManagerRouteFromCounts } from "./manager-route-utils";
import { readManagerStatePersistent } from "./manager-state";

export { countPlayers, resolveModeFallbackPath, resolvePreferredManagerRouteFromCounts } from "./manager-route-utils";

export async function resolvePreferredManagerRoute(managerEmail: string) {
  const [eredivisieState, wkState] = await Promise.all([
    readManagerStatePersistent("eredivisie", managerEmail),
    readManagerStatePersistent("wk", managerEmail),
  ]);

  return resolvePreferredManagerRouteFromCounts({
    eredivisieCount: countPlayers(eredivisieState.lineupIds, eredivisieState.benchIds),
    wkCount: countPlayers(wkState.lineupIds, wkState.benchIds),
  });
}

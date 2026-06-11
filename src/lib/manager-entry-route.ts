import { readManagerStatePersistent } from "./manager-state";

function countPlayers(lineupIds: string[] = [], benchIds: string[] = []) {
  return [...lineupIds, ...benchIds].filter((id) => typeof id === "string" && id.trim().length > 0).length;
}

export function resolvePreferredManagerRouteFromCounts(input: { eredivisieCount: number; wkCount: number }) {
  if (input.wkCount > 0 && input.eredivisieCount === 0) {
    return "/manager/world-cup";
  }

  return "/manager/my-team";
}

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

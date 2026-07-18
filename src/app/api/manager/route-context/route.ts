import { NextResponse } from "next/server";
import { getAuthenticatedEmail, isAuthenticatedSession } from "@/lib/auth-session";
import { ensureAuthStateFromDb } from "@/lib/auth-store";
import { readManagerStatePersistent } from "@/lib/manager-state";
import { countPlayers, hasModeSwitchRoute, resolveModeFallbackPath, resolvePreferredManagerRouteFromCounts } from "@/lib/manager-route-utils";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401, headers: NO_CACHE_HEADERS });
  }

  await ensureAuthStateFromDb();

  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Geen sessie-email" }, { status: 401, headers: NO_CACHE_HEADERS });
  }

  const url = new URL(request.url);
  const currentPath = url.searchParams.get("currentPath") ?? "";

  const [eredivisieState, wkState] = await Promise.all([
    readManagerStatePersistent("eredivisie", email),
    readManagerStatePersistent("wk", email),
  ]);

  const eredivisieCount = countPlayers(eredivisieState.lineupIds, eredivisieState.benchIds);
  const wkCount = countPlayers(wkState.lineupIds, wkState.benchIds);
  const preferredPath = resolvePreferredManagerRouteFromCounts({ eredivisieCount, wkCount });
  const fallbackPath = hasModeSwitchRoute(currentPath)
    ? resolveModeFallbackPath({ currentPath, eredivisieCount, wkCount })
    : null;

  return NextResponse.json(
    {
      currentPath,
      preferredPath,
      fallbackPath,
      counts: {
        eredivisie: eredivisieCount,
        wk: wkCount,
      },
    },
    { headers: NO_CACHE_HEADERS },
  );
}

import { NextResponse } from "next/server";
import { readPersistentJson } from "@/lib/persistent-json-store";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

type ManagerPersonalState = {
  lineupIds?: (number | string)[];
  benchIds?: (number | string)[];
};

type SharedManagerState = {
  managerStates?: Record<string, ManagerPersonalState>;
  lineupIds?: (number | string)[];
  benchIds?: (number | string)[];
};

type TeamRosterState = {
  byTeamId: Record<string, string[]>;
};

/**
 * GET /api/wk/owned-player-ids
 *
 * Returns all fantasyplayer_ids currently in ANY manager's lineup or bench.
 * Reads from BOTH:
 *   - manager-state (synced from draft on page load)
 *   - team-roster-state (raw draft data, for managers who haven't logged in yet)
 */
export async function GET() {
  try {
    const ownedIds = new Set<number>();

    function addIds(ids: (number | string)[] | undefined) {
      for (const id of ids || []) {
        const num = typeof id === "string" ? Number(id) : id;
        if (!isNaN(num) && num > 0) ownedIds.add(num);
      }
    }

    // 1. Collect from manager-state (synced on page load)
    const managerState = await readPersistentJson<SharedManagerState | null>(
      { store: "manager-state", scope: "wk" },
      null,
    );

    if (managerState?.managerStates) {
      for (const personal of Object.values(managerState.managerStates)) {
        addIds(personal.lineupIds);
        addIds(personal.benchIds);
      }
    }
    // Legacy fallback
    if (managerState) {
      addIds(managerState.lineupIds);
      addIds(managerState.benchIds);
    }

    // 2. Collect from team-roster-state (raw draft, all managers)
    const rosterState = await readPersistentJson<TeamRosterState | null>(
      { store: "team-roster-state", scope: "wk" },
      null,
    );

    if (rosterState?.byTeamId) {
      for (const playerIds of Object.values(rosterState.byTeamId)) {
        addIds(playerIds);
      }
    }

    return NextResponse.json({
      count: ownedIds.size,
      ids: [...ownedIds],
    }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[wk/owned-player-ids] Error:", error);
    return NextResponse.json({ count: 0, ids: [] }, { headers: NO_CACHE_HEADERS });
  }
}

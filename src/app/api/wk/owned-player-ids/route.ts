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
  // legacy fallback: single-manager fields
  lineupIds?: (number | string)[];
  benchIds?: (number | string)[];
};

/**
 * GET /api/wk/owned-player-ids
 *
 * Returns all fantasyplayer_ids currently in ANY manager's lineup or bench.
 * Reads from the shared DB state (all managers stored under one key).
 */
export async function GET() {
  try {
    const state = await readPersistentJson<SharedManagerState | null>(
      { store: "manager-state", scope: "wk" },
      null,
    );

    if (!state) {
      return NextResponse.json({ count: 0, ids: [] }, { headers: NO_CACHE_HEADERS });
    }

    const ownedIds = new Set<number>();

    function addIds(ids: (number | string)[] | undefined) {
      for (const id of ids || []) {
        const num = typeof id === "string" ? Number(id) : id;
        if (!isNaN(num) && num > 0) ownedIds.add(num);
      }
    }

    // Collect from all per-manager states
    if (state.managerStates) {
      for (const personal of Object.values(state.managerStates)) {
        addIds(personal.lineupIds);
        addIds(personal.benchIds);
      }
    }

    // Legacy fallback: top-level lineupIds/benchIds
    addIds(state.lineupIds);
    addIds(state.benchIds);

    return NextResponse.json({
      count: ownedIds.size,
      ids: [...ownedIds],
    }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[wk/owned-player-ids] Error:", error);
    return NextResponse.json({ count: 0, ids: [] }, { headers: NO_CACHE_HEADERS });
  }
}

import { NextResponse } from "next/server";
import { readPersistentJson } from "@/lib/persistent-json-store";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

const ALL_MANAGERS = [
  "s.j.m.duindam@gmail.com",
  "johan201@hotmail.com",
  "thomasbart91@gmail.com",
  "jackvandereep@hotmail.com",
  "emielzomerdijk@gmail.com",
  "ice.eckmund@gmail.com",
];

/**
 * GET /api/wk/owned-player-ids
 *
 * Returns all fantasyplayer_ids currently in ANY manager's lineup or bench.
 */
export async function GET() {
  try {
    const ownedIds = new Set<number>();

    for (const email of ALL_MANAGERS) {
      const key = email.toLowerCase().trim();
      const state = await readPersistentJson<{
        lineupIds?: (number | string)[];
        benchIds?: (number | string)[];
      } | null>(
        { store: "manager-state", scope: "wk", managerKey: key },
        null,
      );

      if (state) {
        for (const id of [...(state.lineupIds || []), ...(state.benchIds || [])]) {
          const num = typeof id === "string" ? Number(id) : id;
          if (!isNaN(num) && num > 0) ownedIds.add(num);
        }
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

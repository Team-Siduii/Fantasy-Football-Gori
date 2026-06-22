/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

function resolveDbUrl() {
  return process.env.GORI_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

const STATE_KEY = "gori_fantasy:manager-state:wk:shared";
const ROSTER_KEY = "gori_fantasy:team-roster-state:wk:shared";

export async function POST(request: Request) {
  const body = await request.json() as {
    managerKey: string;
    oldPlayerId: string;
    newPlayerId: string;
    rounds?: number[];  // optioneel: alleen deze rondes updaten. Leeg = alle rondes.
  };

  if (!body.managerKey || !body.oldPlayerId || !body.newPlayerId) {
    return NextResponse.json({ error: "managerKey, oldPlayerId, newPlayerId required" }, { status: 400 });
  }

  const db = resolveDbUrl();
  if (!db) return NextResponse.json({ error: "No DB URL" }, { status: 500 });

  const pool = new Pool({ connectionString: db, ssl: { rejectUnauthorized: false } });

  try {
    // 1. Lees manager state
    const stateResult = await pool.query("SELECT payload FROM gori_fantasy_state WHERE state_key = $1", [STATE_KEY]);
    if (stateResult.rows.length === 0) {
      return NextResponse.json({ error: "State not found" }, { status: 404 });
    }

    const fullState: any = stateResult.rows[0].payload;
    const managerStates: any = fullState.managerStates || {};

    // Zoek manager (case-insensitive, partial match)
    let foundKey = "";
    let foundState: any = null;
    const searchLower = body.managerKey.toLowerCase();
    for (const [k, v] of Object.entries(managerStates)) {
      if (k.toLowerCase().includes(searchLower) || searchLower.includes(k.toLowerCase())) {
        foundKey = k;
        foundState = v as any;
        break;
      }
    }

    if (!foundKey || !foundState) {
      return NextResponse.json({ error: "Manager niet gevonden", availableKeys: Object.keys(managerStates) }, { status: 404 });
    }

    // 2. Vervang speler in lineup en bench
    const replacePlayer = (ids: string[]) => ids.map((id: string) => id === body.oldPlayerId ? body.newPlayerId : id);

    const oldLineup = [...(foundState.lineupIds || [])];
    const oldBench = [...(foundState.benchIds || [])];
    const newLineup = replacePlayer(oldLineup);
    const newBench = replacePlayer(oldBench);

    const hadPlayer = oldLineup.includes(body.oldPlayerId) || oldBench.includes(body.oldPlayerId);

    foundState.lineupIds = newLineup;
    foundState.benchIds = newBench;

    // 3. Update round states — alleen opgegeven rondes, of alle als geen rounds-array
    const targetRoundSet = body.rounds && body.rounds.length > 0
      ? new Set(body.rounds.map(String))
      : null;
    const updatedRounds: string[] = [];
    if (foundState.roundStates) {
      for (const [rk, rs] of Object.entries(foundState.roundStates)) {
        if (targetRoundSet !== null && !targetRoundSet.has(rk)) {
          continue;  // skip rondes die niet in de target list zitten
        }
        const snapshot = rs as any;
        const oldRoundLineup = [...(snapshot.lineupIds || [])];
        const oldRoundBench = [...(snapshot.benchIds || [])];
        snapshot.lineupIds = replacePlayer(oldRoundLineup);
        snapshot.benchIds = replacePlayer(oldRoundBench);
        updatedRounds.push(rk);
      }
    }

    managerStates[foundKey] = foundState;
    fullState.managerStates = managerStates;

    // 4. Schrijf manager state naar DB én file cache
    await pool.query(
      `INSERT INTO gori_fantasy_state (state_key, store_name, scope, manager_key, payload, updated_at)
       VALUES ($1, 'manager-state', 'wk', 'shared', $2::jsonb, NOW())
       ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [STATE_KEY, JSON.stringify(fullState)]
    );

    // Update de file cache op de huidige Vercel instance
    try {
      const { writeFileSync, mkdirSync } = await import("fs");
      const { join } = await import("path");
      const fsPath = process.env.VERCEL
        ? "/tmp/manager-state-wk.json"
        : join(process.cwd(), "data", "manager-state-wk.json");
      mkdirSync(join(fsPath, ".."), { recursive: true });
      writeFileSync(fsPath, JSON.stringify(fullState, null, 2), "utf-8");
    } catch {
      // non-fatal
    }

    // 5. Update roster
    const rosterResult = await pool.query("SELECT payload FROM gori_fantasy_state WHERE state_key = $1", [ROSTER_KEY]);
    if (rosterResult.rows.length > 0) {
      const rosterState: any = rosterResult.rows[0].payload;
      const byTeamId: any = rosterState.byTeamId || {};

      if (byTeamId[foundKey]) {
        byTeamId[foundKey] = replacePlayer(byTeamId[foundKey]);
        rosterState.byTeamId = byTeamId;

        await pool.query(
          `INSERT INTO gori_fantasy_state (state_key, store_name, scope, manager_key, payload, updated_at)
           VALUES ($1, 'team-roster-state', 'wk', 'shared', $2::jsonb, NOW())
           ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
          [ROSTER_KEY, JSON.stringify(rosterState)]
        );
      }
    }

    return NextResponse.json({
      ok: true,
      managerKey: foundKey,
      oldPlayerId: body.oldPlayerId,
      newPlayerId: body.newPlayerId,
      hadPlayer,
      oldLineup,
      oldBench,
      newLineup,
      newBench,
      updatedRounds,
    });
  } finally {
    await pool.end();
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

function resolveDbUrl() {
  return process.env.GORI_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

const ROSTER_KEY = "gori_fantasy:team-roster-state:wk:shared";

export async function POST(request: Request) {
  const body = await request.json() as {
    managerKey: string;
    playerId: string;
  };

  if (!body.managerKey || !body.playerId) {
    return NextResponse.json({ error: "managerKey, playerId required" }, { status: 400 });
  }

  const db = resolveDbUrl();
  if (!db) return NextResponse.json({ error: "No DB URL" }, { status: 500 });

  const pool = new Pool({ connectionString: db, ssl: { rejectUnauthorized: false } });

  try {
    const rosterResult = await pool.query("SELECT payload FROM gori_fantasy_state WHERE state_key = $1", [ROSTER_KEY]);
    if (rosterResult.rows.length === 0) {
      return NextResponse.json({ error: "Roster state not found" }, { status: 404 });
    }

    const rosterState: any = rosterResult.rows[0].payload;
    const byTeamId: any = rosterState.byTeamId || {};

    // Find manager by key (partial match)
    const searchLower = body.managerKey.toLowerCase();
    let foundKey = "";
    for (const k of Object.keys(byTeamId)) {
      if (k.toLowerCase().includes(searchLower) || searchLower.includes(k.toLowerCase())) {
        foundKey = k;
        break;
      }
    }

    if (!foundKey) {
      return NextResponse.json({ error: "Manager not found in roster", availableKeys: Object.keys(byTeamId) }, { status: 404 });
    }

    const currentIds: string[] = byTeamId[foundKey] || [];
    if (currentIds.includes(body.playerId)) {
      return NextResponse.json({ ok: true, alreadyOwned: true, managerKey: foundKey, playerId: body.playerId });
    }

    byTeamId[foundKey] = [...currentIds, body.playerId];
    rosterState.byTeamId = byTeamId;

    await pool.query(
      `INSERT INTO gori_fantasy_state (state_key, store_name, scope, manager_key, payload, updated_at)
       VALUES ($1, 'team-roster-state', 'wk', 'shared', $2::jsonb, NOW())
       ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [ROSTER_KEY, JSON.stringify(rosterState)]
    );

    return NextResponse.json({
      ok: true,
      managerKey: foundKey,
      playerId: body.playerId,
      previousCount: currentIds.length,
      newCount: currentIds.length + 1,
    });
  } finally {
    await pool.end();
  }
}

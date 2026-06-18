/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { Pool } from "pg";
import type { ManagerStateScope } from "@/lib/manager-state";

function resolveDbUrl() {
  return process.env.GORI_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

const STATE_KEY = "gori_fantasy:manager-state:wk:shared";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const scope: ManagerStateScope = (url.searchParams.get("mode") === "wk" ? "wk" : "eredivisie") as ManagerStateScope;
  
  const body = await request.json() as {
    email: string;
    roundNumber: number;
    formation: string;
    lineupIds: string[];
    benchIds: string[];
  };

  if (!body.email || !body.roundNumber) {
    return NextResponse.json({ error: "email and roundNumber required" }, { status: 400 });
  }

  const connectionString = resolveDbUrl();
  if (!connectionString) {
    return NextResponse.json({ error: "DB not available" }, { status: 500 });
  }

  // Verse pool — omzeilt module-level stale pool
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    // Lees huidige state
    const key = scope === "wk" ? STATE_KEY : STATE_KEY.replace(":wk:", ":eredivisie:");
    const readResult = await pool.query(
      "SELECT payload FROM gori_fantasy_state WHERE state_key = $1",
      [key]
    );
    
    if (readResult.rows.length === 0) {
      return NextResponse.json({ error: "State not found" }, { status: 404 });
    }

    const fullState: any = readResult.rows[0].payload;
    const emailLower = body.email.trim().toLowerCase();
    let foundKey: string | null = null;
    let foundState: any = null;
    
    const managerStates: any = fullState.managerStates || {};
    for (const [mkey, ms] of Object.entries(managerStates)) {
      if (!ms || typeof ms !== 'object') continue;
      if (mkey.toLowerCase() === emailLower || 
          ((ms as any).email && (ms as any).email.toLowerCase() === emailLower) ||
          mkey.includes(emailLower.split('@')[0])) {
        foundKey = mkey;
        foundState = ms;
        break;
      }
    }

    if (!foundKey || !foundState) {
      return NextResponse.json({ error: "Manager niet gevonden", keys: Object.keys(managerStates) }, { status: 404 });
    }

    // Update round state
    const roundKey = String(body.roundNumber);
    foundState.roundStates = foundState.roundStates || {};
    foundState.roundStates[roundKey] = {
      ...(foundState.roundStates[roundKey] || {}),
      formation: body.formation,
      lineupIds: [...body.lineupIds],
      benchIds: [...body.benchIds],
    };

    // Update top-level
    foundState.formation = body.formation;
    foundState.lineupIds = [...body.lineupIds];
    foundState.benchIds = [...body.benchIds];

    fullState.formation = body.formation;
    fullState.lineupIds = [...body.lineupIds];
    fullState.benchIds = [...body.benchIds];
    fullState.managerStates = fullState.managerStates || {};
    fullState.managerStates[foundKey] = foundState;

    // SCHRIJF met verse pool
    await pool.query(
      `INSERT INTO gori_fantasy_state (state_key, store_name, scope, manager_key, payload, updated_at)
       VALUES ($1, 'manager-state', $2, 'shared', $3::jsonb, NOW())
       ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [key, scope, JSON.stringify(fullState)]
    );

    return NextResponse.json({
      ok: true,
      formation: foundState.formation,
      lineupIds: foundState.lineupIds,
      benchIds: foundState.benchIds,
    });
  } finally {
    await pool.end();
  }
}

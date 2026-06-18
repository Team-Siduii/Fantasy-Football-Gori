/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

function resolveDbUrl() {
  return process.env.GORI_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

const STATE_KEY = "gori_fantasy:manager-state:wk:shared";

export async function GET() {
  const db = resolveDbUrl();
  if (!db) return NextResponse.json({ error: "No DB URL" }, { status: 500 });
  const pool = new Pool({ connectionString: db, ssl: { rejectUnauthorized: false } });
  try {
    const r = await pool.query("SELECT payload FROM gori_fantasy_state WHERE state_key = $1", [STATE_KEY]);
    const p = r.rows[0]?.payload || {};
    const ms = p.managerStates || {};
    
    let johan: any = null;
    for (const [k, v] of Object.entries(ms)) {
      if (k.toLowerCase().includes('johan')) {
        const vv = v as any;
        johan = { key: k, formation: vv.formation, lineupIds: vv.lineupIds, round2: vv.roundStates?.['2'] };
      }
    }
    
    return NextResponse.json({ formation: p.formation, lineupIds: p.lineupIds, johan });
  } finally { await pool.end(); }
}

export async function POST(request: Request) {
  const body = await request.json() as {
    managerKey: string;
    roundNumber: number;
    formation: string;
    lineupIds: string[];
    benchIds: string[];
  };

  const db = resolveDbUrl();
  if (!db) return NextResponse.json({ error: "No DB" }, { status: 500 });
  
  const pool = new Pool({ connectionString: db, ssl: { rejectUnauthorized: false } });
  
  try {
    // Lees
    const r = await pool.query("SELECT payload FROM gori_fantasy_state WHERE state_key = $1", [STATE_KEY]);
    const fullState: any = r.rows[0]?.payload || {};
    
    const ms = fullState.managerStates || {};
    let found: any = null;
    let foundKey = "";
    for (const [k, v] of Object.entries(ms)) {
      if (k === body.managerKey || k.toLowerCase().includes(body.managerKey.toLowerCase())) {
        found = v as any;
        foundKey = k;
        break;
      }
    }
    if (!found) return NextResponse.json({ error: "Not found", keys: Object.keys(ms) }, { status: 404 });

    const rk = String(body.roundNumber);
    found.roundStates = found.roundStates || {};
    found.roundStates[rk] = { formation: body.formation, lineupIds: [...body.lineupIds], benchIds: [...body.benchIds] };
    found.formation = body.formation;
    found.lineupIds = [...body.lineupIds];
    found.benchIds = [...body.benchIds];
    
    fullState.formation = body.formation;
    fullState.lineupIds = [...body.lineupIds];
    fullState.benchIds = [...body.benchIds];
    fullState.managerStates = { ...ms, [foundKey]: found };

    // Schrijf
    const writeResult = await pool.query(
      `INSERT INTO gori_fantasy_state (state_key, store_name, scope, manager_key, payload, updated_at)
       VALUES ($1, 'manager-state', 'wk', 'shared', $2::jsonb, NOW())
       ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
       RETURNING state_key`,
      [STATE_KEY, JSON.stringify(fullState)]
    );

    // Direct teruglezen ter verificatie
    const verify = await pool.query("SELECT payload FROM gori_fantasy_state WHERE state_key = $1", [STATE_KEY]);
    const vp = verify.rows[0]?.payload || {};
    const vms = vp.managerStates || {};
    let vj: any = null;
    for (const [k, v] of Object.entries(vms)) {
      if (k === foundKey) {
        const vv = v as any;
        vj = { formation: vv.formation, lineupIds: vv.lineupIds, round2: vv.roundStates?.[rk] };
      }
    }

    return NextResponse.json({
      ok: true,
      writeReturned: writeResult.rows[0]?.state_key,
      verified: { formation: vp.formation, lineupIds: vp.lineupIds, johan: vj },
    });
  } finally { await pool.end(); }
}

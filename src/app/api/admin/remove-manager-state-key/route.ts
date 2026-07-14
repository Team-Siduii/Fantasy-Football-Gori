import { NextResponse } from "next/server";
import { Pool } from "pg";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { isAdminEmail } from "@/lib/auth-store";
import type { ManagerStateScope } from "@/lib/manager-state";

type SharedManagerStatePayload = {
  managerStates?: Record<string, unknown>;
  [key: string]: unknown;
};

function resolveDbUrl() {
  return process.env.GORI_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

function resolveScope(request: Request): ManagerStateScope {
  return new URL(request.url).searchParams.get("mode") === "wk" ? "wk" : "eredivisie";
}

function resolveStateKey(scope: ManagerStateScope) {
  return scope === "wk" ? "gori_fantasy:manager-state:wk:shared" : "gori_fantasy:manager-state:eredivisie:shared";
}

export async function POST(request: Request) {
  const actorEmail = await getAuthenticatedEmail();
  if (!actorEmail) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  if (!isAdminEmail(actorEmail)) {
    return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
  }

  let body: { managerKey?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ongeldige request body" }, { status: 400 });
  }

  const managerKey = body.managerKey?.trim();
  if (!managerKey) {
    return NextResponse.json({ error: "managerKey is verplicht" }, { status: 400 });
  }

  const connectionString = resolveDbUrl();
  if (!connectionString) {
    return NextResponse.json({ error: "DB not available" }, { status: 500 });
  }

  const scope = resolveScope(request);
  const stateKey = resolveStateKey(scope);
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    const readResult = await pool.query<{ payload: SharedManagerStatePayload }>(
      "SELECT payload FROM gori_fantasy_state WHERE state_key = $1 LIMIT 1",
      [stateKey],
    );

    const fullState = readResult.rows[0]?.payload;
    if (!fullState) {
      return NextResponse.json({ error: "State not found" }, { status: 404 });
    }

    const currentManagerStates = fullState.managerStates ?? {};
    if (!(managerKey in currentManagerStates)) {
      return NextResponse.json(
        {
          error: "Manager key niet gevonden",
          scope,
          managerKey,
          keys: Object.keys(currentManagerStates),
        },
        { status: 404 },
      );
    }

    const nextManagerStates = { ...currentManagerStates };
    delete nextManagerStates[managerKey];

    const nextState: SharedManagerStatePayload = {
      ...fullState,
      managerStates: nextManagerStates,
    };

    await pool.query(
      `INSERT INTO gori_fantasy_state (state_key, store_name, scope, manager_key, payload, updated_at)
       VALUES ($1::text, 'manager-state', $2::text, 'shared', $3::jsonb, NOW())
       ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [stateKey, scope, JSON.stringify(nextState)],
    );

    return NextResponse.json({
      ok: true,
      scope,
      removedManagerKey: managerKey,
      managerCountBefore: Object.keys(currentManagerStates).length,
      managerCountAfter: Object.keys(nextManagerStates).length,
      remainingKeys: Object.keys(nextManagerStates),
    });
  } finally {
    await pool.end();
  }
}

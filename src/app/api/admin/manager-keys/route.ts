/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { Pool } from "pg";
import { ensureAuthStateFromDb, getAuthAccountByEmail, getAuthAccountById } from "@/lib/auth-store";
import { normalizeManagerKey, type ManagerStateScope } from "@/lib/manager-state";

export const dynamic = "force-dynamic";

function resolveDbUrl() {
  return process.env.GORI_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

const STATE_KEY = "gori_fantasy:manager-state:wk:shared";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope: ManagerStateScope = (url.searchParams.get("mode") === "wk" ? "wk" : "eredivisie") as ManagerStateScope;

  // Sync auth-state uit DB
  await ensureAuthStateFromDb();

  const db = resolveDbUrl();
  if (!db) return NextResponse.json({ error: "No DB URL" }, { status: 500 });

  const pool = new Pool({ connectionString: db, ssl: { rejectUnauthorized: false } });
  try {
    const r = await pool.query("SELECT payload FROM gori_fantasy_state WHERE state_key = $1", [
      scope === "wk" ? STATE_KEY : STATE_KEY.replace(":wk:", ":eredivisie:"),
    ]);
    const payload = (r.rows[0]?.payload || {}) as any;
    const managerStates: Record<string, any> = payload.managerStates || {};

    const keys: Array<{
      dbKey: string;
      canonicalKey: string | null;
      authAccountId: string | null;
      authAccountByEmail: string | null;
      lineupIds: number;
      benchIds: number;
      roundStates: number;
    }> = [];

    for (const [dbKey, ms] of Object.entries(managerStates)) {
      if (!ms || typeof ms !== "object") continue;
      const msObj = ms as any;
      const canonicalKey = normalizeManagerKey(scope, dbKey);
      const authById = getAuthAccountById(dbKey);
      const email = msObj.email || "";
      const authByEmail = email ? getAuthAccountByEmail(email) : null;

      keys.push({
        dbKey,
        canonicalKey,
        authAccountId: authById?.id ?? null,
        authAccountByEmail: authByEmail?.id ?? null,
        lineupIds: Array.isArray(msObj.lineupIds) ? msObj.lineupIds.length : 0,
        benchIds: Array.isArray(msObj.benchIds) ? msObj.benchIds.length : 0,
        roundStates: Object.keys(msObj.roundStates || {}).length,
      });
    }

    return NextResponse.json({
      scope,
      managerCount: keys.length,
      keys,
    });
  } finally {
    await pool.end();
  }
}

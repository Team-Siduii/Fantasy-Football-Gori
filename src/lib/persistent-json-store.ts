import { Pool } from "pg";

export type PersistentStoreName =
  | "auth-state"
  | "draft-state"
  | "team-roster-state"
  | "manager-state"
  | "league-admin-config"
  | "notification-events"
  | "player-points"
  | "team-score-state"
  | "transfer-round-state";

export type PersistentScope = "eredivisie" | "wk" | "global";

export type PersistentStateKeyInput = {
  store: PersistentStoreName;
  scope?: PersistentScope;
  managerKey?: string | null;
};

const APP_NAMESPACE = "gori_fantasy";
let pool: Pool | null = null;
let dbReady = false;
let poolCreatedAt = 0;

export function resolveGoriDatabaseUrl() {
  if (process.env.GORI_DISABLE_DATABASE === "1" || process.env.GORI_DISABLE_DATABASE === "true") {
    return undefined;
  }
  return process.env.GORI_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

export function isGoriDatabaseEnabled() {
  return Boolean(resolveGoriDatabaseUrl());
}

export type GoriDatabaseDebugInfo = {
  enabled: boolean;
  disabledByEnv: boolean;
  sourceEnv: "GORI_DATABASE_URL" | "DATABASE_URL" | "POSTGRES_URL" | null;
  host: string | null;
  database: string | null;
  user: string | null;
  neonProjectId: string | null;
};

function resolveGoriDatabaseSourceEnv(): GoriDatabaseDebugInfo["sourceEnv"] {
  if (process.env.GORI_DISABLE_DATABASE === "1" || process.env.GORI_DISABLE_DATABASE === "true") {
    return null;
  }
  if (process.env.GORI_DATABASE_URL) {
    return "GORI_DATABASE_URL";
  }
  if (process.env.DATABASE_URL) {
    return "DATABASE_URL";
  }
  if (process.env.POSTGRES_URL) {
    return "POSTGRES_URL";
  }
  return null;
}

export function resolveGoriDatabaseDebugInfo(): GoriDatabaseDebugInfo {
  const disabledByEnv = process.env.GORI_DISABLE_DATABASE === "1" || process.env.GORI_DISABLE_DATABASE === "true";
  const sourceEnv = resolveGoriDatabaseSourceEnv();
  const connectionString = disabledByEnv ? undefined : resolveGoriDatabaseUrl();

  let host = process.env.POSTGRES_HOST ?? null;
  let database = process.env.POSTGRES_DATABASE || process.env.PGDATABASE || null;
  let user = process.env.POSTGRES_USER ?? null;

  if (connectionString) {
    try {
      const parsed = new URL(connectionString);
      host = parsed.hostname || host;
      database = parsed.pathname.replace(/^\//, "") || database;
      user = parsed.username ? decodeURIComponent(parsed.username) : user;
    } catch {
      // Fall back to discrete env vars when the URL cannot be parsed.
    }
  }

  return {
    enabled: Boolean(connectionString),
    disabledByEnv,
    sourceEnv,
    host,
    database,
    user,
    neonProjectId: process.env.NEON_PROJECT_ID ?? null,
  };
}

function normalizeKeySegment(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

export function buildPersistentStateKey(input: PersistentStateKeyInput) {
  const scope = normalizeKeySegment(input.scope ?? "global", "global");
  const manager = normalizeKeySegment(input.managerKey, "shared");
  return `${APP_NAMESPACE}:${input.store}:${scope}:${manager}`;
}

function getPool() {
  const connectionString = resolveGoriDatabaseUrl();
  if (!connectionString) {
    return null;
  }

  // Herstart pool als die ouder is dan 60 seconden (Vercel warm invocation)
  const now = Date.now();
  if (pool && (now - poolCreatedAt) > 60_000) {
    pool.end().catch(() => {});
    pool = null;
    dbReady = false;
  }

  if (!pool) {
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
    poolCreatedAt = now;
  }

  return pool;
}

async function ensureDb() {
  const activePool = getPool();
  if (!activePool || dbReady) {
    return activePool;
  }

  await activePool.query(`
    CREATE TABLE IF NOT EXISTS gori_fantasy_state (
      state_key TEXT PRIMARY KEY,
      app_namespace TEXT NOT NULL DEFAULT 'gori_fantasy',
      store_name TEXT NOT NULL,
      scope TEXT NOT NULL,
      manager_key TEXT NOT NULL DEFAULT 'shared',
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await activePool.query("CREATE INDEX IF NOT EXISTS gori_fantasy_state_store_scope_idx ON gori_fantasy_state (store_name, scope);");
  dbReady = true;
  return activePool;
}

const UPSERT_PERSISTENT_STATE_SQL = `INSERT INTO gori_fantasy_state (state_key, store_name, scope, manager_key, payload, updated_at)
     VALUES ($1::text, $2::text, $3::text, $4::text, $5::jsonb, NOW())
     ON CONFLICT (state_key) DO UPDATE SET
       payload = EXCLUDED.payload,
       updated_at = NOW()`;

function shouldAttemptBootstrap(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybe = error as { code?: string; message?: string };
  return maybe.code === "42P01" || maybe.message?.toLowerCase().includes("gori_fantasy_state") === true;
}

function getReadablePool() {
  return getPool();
}

export async function readPersistentJson<T>(input: PersistentStateKeyInput, fallback: T): Promise<T> {
  const activePool = getReadablePool();
  if (!activePool) {
    return fallback;
  }

  const stateKey = buildPersistentStateKey(input);
  const result = await activePool.query<{ payload: T }>("SELECT payload FROM gori_fantasy_state WHERE state_key = $1 LIMIT 1", [
    stateKey,
  ]);

  return result.rows[0]?.payload ?? fallback;
}

export async function writePersistentJson<T>(input: PersistentStateKeyInput, payload: T): Promise<T> {
  const activePool = getPool();
  if (!activePool) {
    return payload;
  }

  const scope = normalizeKeySegment(input.scope ?? "global", "global");
  const manager = normalizeKeySegment(input.managerKey, "shared");
  const stateKey = buildPersistentStateKey(input);
  const params = [stateKey, input.store, scope, manager, JSON.stringify(payload)];

  try {
    await activePool.query(UPSERT_PERSISTENT_STATE_SQL, params);
    return payload;
  } catch (error) {
    if (!shouldAttemptBootstrap(error)) {
      throw error;
    }
  }

  const bootstrappedPool = await ensureDb();
  if (!bootstrappedPool) {
    return payload;
  }

  await bootstrappedPool.query(UPSERT_PERSISTENT_STATE_SQL, params);
  return payload;
}

export async function deletePersistentJson(input: PersistentStateKeyInput): Promise<void> {
  const activePool = await ensureDb();
  if (!activePool) {
    return;
  }

  await activePool.query("DELETE FROM gori_fantasy_state WHERE state_key = $1", [buildPersistentStateKey(input)]);
}

export function resetPersistentJsonStoreForTests() {
  dbReady = false;
  if (pool) {
    void pool.end();
    pool = null;
  }
}

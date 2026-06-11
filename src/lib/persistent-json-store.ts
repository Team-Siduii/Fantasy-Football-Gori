import { Pool } from "pg";

export type PersistentStoreName =
  | "auth-state"
  | "draft-state"
  | "team-roster-state"
  | "manager-state"
  | "league-admin-config"
  | "notification-events"
  | "player-points";

export type PersistentScope = "eredivisie" | "wk" | "global";

export type PersistentStateKeyInput = {
  store: PersistentStoreName;
  scope?: PersistentScope;
  managerKey?: string | null;
};

const APP_NAMESPACE = "gori_fantasy";
let pool: Pool | null = null;
let dbReady = false;

export function resolveGoriDatabaseUrl() {
  if (process.env.GORI_DISABLE_DATABASE === "1" || process.env.GORI_DISABLE_DATABASE === "true") {
    return undefined;
  }

  return process.env.GORI_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

export function isGoriDatabaseEnabled() {
  return Boolean(resolveGoriDatabaseUrl());
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

  if (!pool) {
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
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

export async function readPersistentJson<T>(input: PersistentStateKeyInput, fallback: T): Promise<T> {
  const activePool = await ensureDb();
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
  const activePool = await ensureDb();
  if (!activePool) {
    return payload;
  }

  const scope = normalizeKeySegment(input.scope ?? "global", "global");
  const manager = normalizeKeySegment(input.managerKey, "shared");
  const stateKey = buildPersistentStateKey(input);
  await activePool.query(
    `INSERT INTO gori_fantasy_state (state_key, store_name, scope, manager_key, payload, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (state_key) DO UPDATE SET
       payload = EXCLUDED.payload,
       updated_at = NOW()`,
    [stateKey, input.store, scope, manager, JSON.stringify(payload)],
  );

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

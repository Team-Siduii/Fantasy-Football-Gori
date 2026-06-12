import "server-only";
import { resolveGoriDatabaseUrl } from "./persistent-json-store";
import { Pool } from "pg";

// ── Database ────────────────────────────────────────────────────────

let pool: Pool | null = null;
let dbReady = false;

function getPool(): Pool | null {
  const connectionString = resolveGoriDatabaseUrl();
  if (!connectionString) return null;
  if (!pool) {
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

async function ensureSchema() {
  const p = getPool();
  if (!p || dbReady) return p;

  await p.query(`
    CREATE TABLE IF NOT EXISTS wk_matches (
      match_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      home_team_code TEXT NOT NULL DEFAULT '',
      away_team_code TEXT NOT NULL DEFAULT '',
      home_score INTEGER,
      away_score INTEGER,
      status TEXT NOT NULL DEFAULT 'F',
      kickoff_at TEXT,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (match_id, round)
    );

    CREATE TABLE IF NOT EXISTS wk_player_points (
      fantasyplayer_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      name TEXT NOT NULL,
      team_name TEXT NOT NULL,
      team_code TEXT NOT NULL DEFAULT '',
      position TEXT NOT NULL DEFAULT '',
      position_nl TEXT NOT NULL DEFAULT '',
      value INTEGER NOT NULL DEFAULT 0,
      round_points INTEGER NOT NULL DEFAULT 0,
      total_points INTEGER NOT NULL DEFAULT 0,
      has_played BOOLEAN NOT NULL DEFAULT false,
      num_played INTEGER NOT NULL DEFAULT 0,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (fantasyplayer_id, round)
    );

    CREATE TABLE IF NOT EXISTS wk_player_events (
      id SERIAL PRIMARY KEY,
      fantasyplayer_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      event_code TEXT NOT NULL,
      points INTEGER NOT NULL,
      minute INTEGER,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS wk_player_events_player_round_idx
      ON wk_player_events (fantasyplayer_id, round);
    CREATE INDEX IF NOT EXISTS wk_player_points_round_idx
      ON wk_player_points (round);
    CREATE INDEX IF NOT EXISTS wk_matches_round_idx
      ON wk_matches (round);
  `);

  dbReady = true;
  return p;
}

export async function isWkStoreAvailable(): Promise<boolean> {
  const p = await ensureSchema();
  return p !== null;
}

// ── Types ───────────────────────────────────────────────────────────

export type WkMatchRow = {
  match_id: number;
  round: number;
  home_team: string;
  away_team: string;
  home_team_code: string;
  away_team_code: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  kickoff_at: string | null;
  synced_at: string;
};

export type WkPlayerPointRow = {
  fantasyplayer_id: number;
  round: number;
  name: string;
  team_name: string;
  team_code: string;
  position: string;
  position_nl: string;
  value: number;
  round_points: number;
  total_points: number;
  has_played: boolean;
  num_played: number;
  synced_at: string;
};

export type WkPlayerEventRow = {
  id: number;
  fantasyplayer_id: number;
  round: number;
  event_code: string;
  points: number;
  minute: number | null;
  synced_at: string;
};

// ── Write ───────────────────────────────────────────────────────────

export async function saveWkMatches(
  matches: Array<{
    match_id: number;
    round: number;
    home_team: string;
    away_team: string;
    home_team_code: string;
    away_team_code: string;
    home_score: number | null;
    away_score: number | null;
    status: string;
    kickoff_at: string | null;
  }>,
): Promise<void> {
  const p = await ensureSchema();
  if (!p || matches.length === 0) return;

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    for (const m of matches) {
      await client.query(
        `INSERT INTO wk_matches (match_id, round, home_team, away_team, home_team_code, away_team_code, home_score, away_score, status, kickoff_at, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT (match_id, round) DO UPDATE SET
           home_score = EXCLUDED.home_score,
           away_score = EXCLUDED.away_score,
           status = EXCLUDED.status,
           synced_at = NOW()`,
        [m.match_id, m.round, m.home_team, m.away_team, m.home_team_code, m.away_team_code, m.home_score, m.away_score, m.status, m.kickoff_at],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function saveWkPlayerPoints(
  players: Array<{
    fantasyplayer_id: number;
    round: number;
    name: string;
    team_name: string;
    team_code: string;
    position: string;
    position_nl: string;
    value: number;
    round_points: number;
    total_points: number;
    has_played: boolean;
    num_played: number;
  }>,
): Promise<void> {
  const p = await ensureSchema();
  if (!p || players.length === 0) return;

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    for (const pl of players) {
      await client.query(
        `INSERT INTO wk_player_points (fantasyplayer_id, round, name, team_name, team_code, position, position_nl, value, round_points, total_points, has_played, num_played, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
         ON CONFLICT (fantasyplayer_id, round) DO UPDATE SET
           name = EXCLUDED.name,
           team_name = EXCLUDED.team_name,
           team_code = EXCLUDED.team_code,
           position = EXCLUDED.position,
           position_nl = EXCLUDED.position_nl,
           value = EXCLUDED.value,
           round_points = EXCLUDED.round_points,
           total_points = EXCLUDED.total_points,
           has_played = EXCLUDED.has_played,
           num_played = EXCLUDED.num_played,
           synced_at = NOW()`,
        [pl.fantasyplayer_id, pl.round, pl.name, pl.team_name, pl.team_code, pl.position, pl.position_nl, pl.value, pl.round_points, pl.total_points, pl.has_played, pl.num_played],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function saveWkPlayerEvents(
  events: Array<{
    fantasyplayer_id: number;
    round: number;
    event_code: string;
    points: number;
    minute?: number;
  }>,
): Promise<void> {
  const p = await ensureSchema();
  if (!p || events.length === 0) return;

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    // Delete old events for this round before re-inserting
    const rounds = [...new Set(events.map((e) => e.round))];
    for (const r of rounds) {
      await client.query("DELETE FROM wk_player_events WHERE round = $1", [r]);
    }
    for (const ev of events) {
      await client.query(
        `INSERT INTO wk_player_events (fantasyplayer_id, round, event_code, points, minute, synced_at)
         VALUES ($1,$2,$3,$4,$5,NOW())`,
        [ev.fantasyplayer_id, ev.round, ev.event_code, ev.points, ev.minute ?? null],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ── Read ────────────────────────────────────────────────────────────

export async function getWkPlayerPoints(
  round?: number,
): Promise<WkPlayerPointRow[]> {
  const p = await ensureSchema();
  if (!p) return [];

  if (round) {
    const r = await p.query<WkPlayerPointRow>(
      "SELECT * FROM wk_player_points WHERE round = $1 ORDER BY total_points DESC",
      [round],
    );
    return r.rows;
  }

  const r = await p.query<WkPlayerPointRow>(
    "SELECT DISTINCT ON (fantasyplayer_id) * FROM wk_player_points ORDER BY fantasyplayer_id, round DESC",
  );
  return r.rows;
}

export async function getWkPlayerEvents(
  round?: number,
  fantasyplayerId?: number,
): Promise<WkPlayerEventRow[]> {
  const p = await ensureSchema();
  if (!p) return [];

  let query = "SELECT * FROM wk_player_events WHERE 1=1";
  const params: (number | string)[] = [];
  let paramIdx = 1;

  if (round) {
    query += ` AND round = $${paramIdx++}`;
    params.push(round);
  }
  if (fantasyplayerId) {
    query += ` AND fantasyplayer_id = $${paramIdx++}`;
    params.push(fantasyplayerId);
  }
  query += " ORDER BY fantasyplayer_id, minute";

  const r = await p.query<WkPlayerEventRow>(query, params);
  return r.rows;
}

export async function getWkMatches(
  round?: number,
): Promise<WkMatchRow[]> {
  const p = await ensureSchema();
  if (!p) return [];

  if (round) {
    const r = await p.query<WkMatchRow>(
      "SELECT * FROM wk_matches WHERE round = $1 ORDER BY match_id",
      [round],
    );
    return r.rows;
  }

  const r = await p.query<WkMatchRow>(
    "SELECT * FROM wk_matches ORDER BY round, match_id",
  );
  return r.rows;
}

export async function getLatestSyncRound(): Promise<number | null> {
  const p = await ensureSchema();
  if (!p) return null;

  const r = await p.query<{ max_round: number }>(
    "SELECT MAX(round) as max_round FROM wk_player_points",
  );
  return r.rows[0]?.max_round ?? null;
}

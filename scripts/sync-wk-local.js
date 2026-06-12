// Local sync script — runs full WKCoach data sync to Neon DB
// Usage: node scripts/sync-wk-local.js

const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || process.env.GORI_DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ua = "Mozilla/5.0";
const EMAIL = "simon15_@hotmail.com";
const PASS = "Voetbal7";

function parseSetCookies(header) {
  if (!header) return {};
  const c = {};
  for (const part of header.split(/,\s*(?=[^;]+?=)/g)) {
    const [kv] = part.split(";");
    const idx = kv.indexOf("=");
    if (idx > 0) c[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
  }
  return c;
}
function cookieHeader(c) {
  return Object.entries(c).map(([k, v]) => k + "=" + v).join("; ");
}

async function ensureSchema() {
  await pool.query(`
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
    CREATE INDEX IF NOT EXISTS wk_player_events_player_round_idx ON wk_player_events (fantasyplayer_id, round);
    CREATE INDEX IF NOT EXISTS wk_player_points_round_idx ON wk_player_points (round);
    CREATE INDEX IF NOT EXISTS wk_matches_round_idx ON wk_matches (round);
  `);
  console.log("Schema ensured.");
}

async function syncPlayers(round) {
  // Login
  const cookies = {};
  const loginPage = await fetch("https://www.wkcoach.nl/accounts/login/", {
    headers: { "User-Agent": ua }, cache: "no-store",
  });
  Object.assign(cookies, parseSetCookies(loginPage.headers.get("set-cookie")));
  const html = await loginPage.text();
  const csrf = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1] || cookies.csrftoken;
  const form = new URLSearchParams();
  form.set("csrfmiddlewaretoken", csrf); form.set("login", EMAIL); form.set("password", PASS);
  const lpRes = await fetch("https://www.wkcoach.nl/accounts/login/", {
    method: "POST",
    headers: {
      "User-Agent": ua, Referer: "https://www.wkcoach.nl/accounts/login/",
      Origin: "https://www.wkcoach.nl", "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(cookies),
    },
    body: form.toString(), redirect: "manual", cache: "no-store",
  });
  Object.assign(cookies, parseSetCookies(lpRes.headers.get("set-cookie")));
  if (!cookies.sessionid) { console.log("Login failed"); return; }
  console.log("Logged in.");

  const h = {
    "User-Agent": ua, Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest", Referer: "https://www.wkcoach.nl/app/",
    Cookie: cookieHeader(cookies),
  };

  // Fetch all players with points
  const pageSize = 200;
  const firstRes = await fetch(
    `https://www.wkcoach.nl/api/players/search_all/${round}/?page=1&page_size=${pageSize}&sort=-total_points&ts=${Date.now()}`,
    { headers: h, cache: "no-store" },
  );
  const firstData = await firstRes.json();
  const all = [...firstData.players];
  const totalPages = firstData.pagination?.total_pages || 1;
  console.log("Page 1/" + totalPages + " — " + all.length + " players so far");

  for (let p = 2; p <= totalPages; p++) {
    const r = await fetch(
      `https://www.wkcoach.nl/api/players/search_all/${round}/?page=${p}&page_size=${pageSize}&sort=-total_points&ts=${Date.now()}`,
      { headers: h, cache: "no-store" },
    );
    const d = await r.json();
    all.push(...d.players);
    console.log("Page " + p + "/" + totalPages + " — " + all.length + " players so far");
  }

  console.log("Total players:", all.length);

  // Save to DB
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Players
    for (const p of all) {
      await client.query(
        `INSERT INTO wk_player_points (fantasyplayer_id, round, name, team_name, team_code, position, position_nl, value, round_points, total_points, has_played, num_played, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
         ON CONFLICT (fantasyplayer_id, round) DO UPDATE SET
           name = EXCLUDED.name, team_name = EXCLUDED.team_name, team_code = EXCLUDED.team_code,
           position = EXCLUDED.position, position_nl = EXCLUDED.position_nl, value = EXCLUDED.value,
           round_points = EXCLUDED.round_points, total_points = EXCLUDED.total_points,
           has_played = EXCLUDED.has_played, num_played = EXCLUDED.num_played, synced_at = NOW()`,
        [p.fantasyplayer_id, round, p.name, p.club_fullname, p.club_codename, p.position, p.position_nl, p.value, p.round_points, p.total_points, p.has_played, p.num_played],
      );
    }

    // Events
    await client.query("DELETE FROM wk_player_events WHERE round = $1", [round]);
    for (const p of all) {
      for (const evt of (p.point_events || [])) {
        await client.query(
          `INSERT INTO wk_player_events (fantasyplayer_id, round, event_code, points, minute, synced_at)
           VALUES ($1,$2,$3,$4,$5,NOW())`,
          [p.fantasyplayer_id, round, evt.event_code, evt.points, evt.minute || null],
        );
      }
    }

    await client.query("COMMIT");
    console.log("Saved " + all.length + " players to DB.");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // Fetch and save matches
  try {
    const matchesRes = await fetch(
      `https://www.wkcoach.nl/api/teams/matches/?round_seq=${round}`,
      { headers: h, cache: "no-store" },
    );
    if (matchesRes.ok) {
      const matchesData = await matchesRes.json();
      const matches = (matchesData.matches || []).map((m) => ({
        match_id: m.id, round: m.round,
        home_team: m.home_team?.full_name || "?", away_team: m.away_team?.full_name || "?",
        home_team_code: m.home_team?.codename || "", away_team_code: m.away_team?.codename || "",
        home_score: m.home_score >= 0 ? m.home_score : null,
        away_score: m.away_score >= 0 ? m.away_score : null,
        status: m.status, kickoff_at: m.start_date_str || null,
      }));
      const c2 = await pool.connect();
      try {
        await c2.query("BEGIN");
        for (const m of matches) {
          await c2.query(
            `INSERT INTO wk_matches (match_id, round, home_team, away_team, home_team_code, away_team_code, home_score, away_score, status, kickoff_at, synced_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
             ON CONFLICT (match_id, round) DO UPDATE SET
               home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score, status = EXCLUDED.status, synced_at = NOW()`,
            [m.match_id, m.round, m.home_team, m.away_team, m.home_team_code, m.away_team_code, m.home_score, m.away_score, m.status, m.kickoff_at],
          );
        }
        await c2.query("COMMIT");
        console.log("Saved " + matches.length + " matches to DB.");
      } catch (e) {
        await c2.query("ROLLBACK");
        console.error("Match save error:", e.message);
      } finally {
        c2.release();
      }
    }
  } catch (e) {
    console.error("Match fetch error:", e.message);
  }

  return all.length;
}

async function main() {
  const round = parseInt(process.argv[2] || "1", 10);
  console.log("Syncing round " + round + "...");
  await ensureSchema();
  const count = await syncPlayers(round);
  console.log("Done. Synced " + count + " players for round " + round + ".");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

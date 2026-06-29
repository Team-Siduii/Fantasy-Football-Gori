import pg from 'pg';
import fs from 'fs';

const envContent = fs.readFileSync('/tmp/gori/.env.real', 'utf8');
const match = envContent.match(/DATABASE_URL=(.+)/);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  // Find team Ice
  const teams = await pool.query("SELECT id, name, manager_id FROM fantasy_teams WHERE LOWER(name) LIKE $1", ['%ice%']);
  console.log('TEAMS:', JSON.stringify(teams.rows, null, 2));

  // Find players Guimares and Ruiz
  const players = await pool.query("SELECT id, name, team_name, position, price FROM players WHERE LOWER(name) LIKE $1 OR LOWER(name) LIKE $2", ['%guimares%', '%ruiz%']);
  console.log('PLAYERS:', JSON.stringify(players.rows, null, 2));

  if (teams.rows.length > 0) {
    const tid = teams.rows[0].id;
    const tps = await pool.query(
      `SELECT tp.id as tp_id, tp.player_id, tp.status, tp.lineup_order, p.name, p.position 
       FROM team_players tp JOIN players p ON tp.player_id = p.id 
       WHERE tp.team_id = $1 ORDER BY tp.lineup_order`, [tid]);
    console.log('TEAM_PLAYERS:', JSON.stringify(tps.rows, null, 2));
  }
} finally {
  await pool.end();
}

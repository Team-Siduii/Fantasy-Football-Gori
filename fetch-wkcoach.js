const ua = 'Mozilla/5.0';
const cookies = {};

function parseCookies(header) {
  if (!header) return;
  for (const part of header.split(/,\s*(?=[^;]+?=)/g)) {
    const [kv] = part.split(';');
    const idx = kv.indexOf('=');
    if (idx > 0) cookies[kv.slice(0,idx).trim()] = kv.slice(idx+1).trim();
  }
}

async function login(email, password) {
  const loginPage = await fetch('https://www.wkcoach.nl/accounts/login/', { headers: { 'User-Agent': ua } });
  parseCookies(loginPage.headers.get('set-cookie'));
  const html = await loginPage.text();
  const csrf = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1] || cookies.csrftoken;
  if (!csrf) { console.log('No CSRF token found!'); return false; }
  
  const form = new URLSearchParams();
  form.set('csrfmiddlewaretoken', csrf);
  form.set('login', email);
  form.set('password', password);
  
  const loginPost = await fetch('https://www.wkcoach.nl/accounts/login/', {
    method: 'POST',
    headers: {
      'User-Agent': ua, Referer: 'https://www.wkcoach.nl/accounts/login/',
      Origin: 'https://www.wkcoach.nl', 'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),
    },
    body: form.toString(), redirect: 'manual',
  });
  parseCookies(loginPost.headers.get('set-cookie'));
  return !!cookies.sessionid;
}

async function fetchAllPlayers(round) {
  const cookieHeader = Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ');
  const headers = {
    'User-Agent': ua, Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: 'https://www.wkcoach.nl/app/',
    Cookie: cookieHeader,
  };

  let allPlayers = [];
  let page = 1;
  while (true) {
    const url = `https://www.wkcoach.nl/api/players/search_all/${round}/?page=${page}&page_size=100&sort=-total_points`;
    console.error(`Fetching page ${page}...`);
    const res = await fetch(url, { headers });
    const text = await res.text();
    
    let data;
    try { data = JSON.parse(text); } catch { console.error(`Page ${page} parse error:`, text.substring(0,200)); break; }
    
    // Handle both response formats
    let players;
    if (data.players) {
      players = data.players;
    } else {
      players = Object.values(data).filter(v => typeof v === 'object' && v !== null && v.id);
    }
    
    if (!players || players.length === 0) break;
    allPlayers.push(...players);
    
    const total = data.pagination?.total_players || 0;
    const numPages = data.pagination?.total_pages || 1;
    console.error(`  Got ${players.length} players (total so far: ${allPlayers.length}, pages: ${numPages})`);
    
    if (page >= numPages) break;
    page++;
  }
  return allPlayers;
}

async function main() {
  const email = process.env.WKCOACH_EMAIL || 'simon15_@hotmail.com';
  const password = process.env.WKCOACH_PASSWORD || 'Voetbal7';
  
  console.error(`Logging in as ${email}...`);
  const ok = await login(email, password);
  if (!ok) { console.error('Login failed!'); process.exit(1); }
  console.error('Logged in!\n');
  
  const round = process.argv[2] || '1';
  const players = await fetchAllPlayers(round);
  
  console.error(`\nTotal players fetched: ${players.length}`);
  
  // Stats
  let withPoints = players.filter(p => p.total_points > 0).length;
  let withEvents = players.filter(p => p.point_events && p.point_events.length > 0).length;
  console.error(`With points: ${withPoints}, With events: ${withEvents}`);
  
  // Show top 10
  console.error('\nTop 10 by total_points:');
  for (const p of players.slice(0,10)) {
    console.error(`  ${p.name.padEnd(25)} ${p.team_name?.padEnd(15) || ''} ${p.position?.padEnd(5) || ''} total=${p.total_points} round=${p.round_points} events=${p.point_events?.length || 0}`);
  }
  
  // Show players with events
  console.error('\nPlayers with events this round:');
  for (const p of players) {
    if (p.point_events && p.point_events.length > 0) {
      console.error(`  ${p.name.padEnd(25)} ${p.team_name?.padEnd(15) || ''} ${p.round_points}pts: ${JSON.stringify(p.point_events)}`);
    }
  }
  
  // Output JSON for piping
  console.log(JSON.stringify(players));
}

main().catch(e => { console.error(e); process.exit(1); });

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

function cookieHeader() {
  return Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ');
}

function apiHeaders() {
  return {
    'User-Agent': ua, Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: 'https://www.wkcoach.nl/app/',
    Cookie: cookieHeader(),
  };
}

async function login(email, password) {
  const loginPage = await fetch('https://www.wkcoach.nl/accounts/login/', { headers: { 'User-Agent': ua } });
  parseCookies(loginPage.headers.get('set-cookie'));
  const html = await loginPage.text();
  const csrf = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1] || cookies.csrftoken;
  if (!csrf) { console.error('No CSRF token found!'); return false; }
  
  const form = new URLSearchParams();
  form.set('csrfmiddlewaretoken', csrf);
  form.set('login', email);
  form.set('password', password);
  
  const loginPost = await fetch('https://www.wkcoach.nl/accounts/login/', {
    method: 'POST',
    headers: {
      'User-Agent': ua, Referer: 'https://www.wkcoach.nl/accounts/login/',
      Origin: 'https://www.wkcoach.nl', 'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(),
    },
    body: form.toString(), redirect: 'manual',
  });
  parseCookies(loginPost.headers.get('set-cookie'));
  return !!cookies.sessionid;
}

async function fetchAllPlayers(round) {
  let allPlayers = [];
  let page = 1;
  while (true) {
    const url = `https://www.wkcoach.nl/api/players/search_all/${round}/?page=${page}&page_size=100&sort=-total_points`;
    console.error(`Fetching players page ${page}...`);
    const res = await fetch(url, { headers: apiHeaders() });
    const text = await res.text();
    
    let data;
    try { data = JSON.parse(text); } catch { console.error(`Page ${page} parse error:`, text.substring(0,200)); break; }
    
    let players;
    if (data.players) {
      players = data.players;
    } else {
      players = Object.values(data).filter(v => typeof v === 'object' && v !== null && v.id);
    }
    
    if (!players || players.length === 0) break;
    allPlayers.push(...players);
    
    const numPages = data.pagination?.total_pages || 1;
    console.error(`  Got ${players.length} (total: ${allPlayers.length}, pages: ${numPages})`);
    
    if (page >= numPages) break;
    page++;
  }
  return allPlayers;
}

async function fetchMatches(round) {
  const url = `https://www.wkcoach.nl/api/teams/matches/?round_seq=${round}`;
  console.error(`Fetching matches round ${round}...`);
  const res = await fetch(url, { headers: apiHeaders() });
  const data = await res.json();
  console.error(`  Got ${Array.isArray(data) ? data.length : Object.keys(data).length} matches`);
  return data;
}

async function main() {
  const email = process.env.WKCOACH_EMAIL || 'simon15_@hotmail.com';
  const password = process.env.WKCOACH_PASSWORD || 'Voetbal7';
  
  console.error(`Logging in as ${email}...`);
  const ok = await login(email, password);
  if (!ok) { console.error('Login failed!'); process.exit(1); }
  console.error('Logged in!');
  
  const round = process.argv[2] || '1';
  
  // Fetch players
  const players = await fetchAllPlayers(round);
  console.error(`\nTotal players: ${players.length}`);
  
  // Fetch matches
  const matches = await fetchMatches(round);
  
  // Output combined JSON to stdout
  const output = {
    round: parseInt(round),
    players: players,
    matches: matches,
  };
  console.log(JSON.stringify(output));
}

main().catch(e => { console.error(e); process.exit(1); });

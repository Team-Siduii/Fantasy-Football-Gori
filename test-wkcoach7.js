const fs = require('fs');
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

function readCreds() {
  const env = fs.readFileSync('.env.prod', 'utf-8');
  const emailMatch = env.match(/WKCOACH_EMAIL="([^"]+)"/);
  const passMatch = env.match(/WKCOACH_PASSWORD="([^"]+)"/);
  return {
    email: emailMatch ? emailMatch[1] : '',
    password: passMatch ? passMatch[1] : ''
  };
}

async function login(email, password) {
  const loginPage = await fetch('https://www.wkcoach.nl/accounts/login/', { headers: { 'User-Agent': ua } });
  parseCookies(loginPage.headers.get('set-cookie'));
  const html = await loginPage.text();
  const csrf = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1] || cookies.csrftoken;
  
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

async function tryEndpoint(url, label) {
  try {
    const cookieHeader = Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ');
    const res = await fetch(url, {
      headers: {
        'User-Agent': ua, Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://www.wkcoach.nl/app/',
        Cookie: cookieHeader,
      }
    });
    const text = await res.text();
    const isJson = text.startsWith('{') || text.startsWith('[');
    let count = 0;
    if (isJson) {
      try { const d = JSON.parse(text); count = Array.isArray(d) ? d.length : (d.players?.length || d.results?.length || d.data?.length || Object.keys(d).length); } catch {}
    }
    console.log(label.padEnd(50), res.status, isJson ? 'JSON' : 'HTML', count > 0 ? '(' + count + ' items)' : '');
    if (count > 10 && text.length < 1000) {
      console.log('  Preview:', text.substring(0, 500));
    }
    if (count > 10 && text.length >= 1000) {
      console.log('  Large payload, first 300 chars:', text.substring(0, 300));
    }
  } catch(e) {
    console.log(label.padEnd(50), 'ERR:', e.message);
  }
}

async function main() {
  const { email, password } = readCreds();
  if (!email || !password) { console.log('Creds not found'); return; }
  console.log('Email:', email);
  
  const ok = await login(email, password);
  if (!ok) { console.log('Login failed'); return; }
  console.log('Logged in!\n');
  
  // Fetch JS bundle
  const appRes = await fetch('https://www.wkcoach.nl/app/', {
    headers: { 'User-Agent': ua, Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ') }
  });
  const appHtml = await appRes.text();
  const jsMatch = appHtml.match(/src="(\/app\/assets\/index-[^"]+\.js)"/);
  
  if (jsMatch) {
    const jsRes = await fetch('https://www.wkcoach.nl' + jsMatch[1], { headers: { 'User-Agent': ua } });
    const js = await jsRes.text();
    
    // Find ALL api routes
    const routes = js.match(/["'`](\/api\/[a-zA-Z0-9_\/?=&.%{}+:\[\]-]{5,150})["'`]/g) || [];
    const clean = [...new Set(routes.map(r => r.replace(/^["'`]|["'`]$/g, '').replace(/\$\{.*?\}/g, ':param:')))].sort();
    console.log('API routes in JS (' + clean.length + '):');
    for (const r of clean) console.log(' ', r);
  }
  
  // Try endpoints that might have all players
  console.log('\nTrying endpoints:');
  await tryEndpoint('https://www.wkcoach.nl/api/team/players/?round_seq=1', 'team/players/');
  await tryEndpoint('https://www.wkcoach.nl/api/players/?round_seq=1', 'players/');
  await tryEndpoint('https://www.wkcoach.nl/api/players/list/?round_seq=1', 'players/list/');
  await tryEndpoint('https://www.wkcoach.nl/api/transfer/players/?round_seq=1', 'transfer/players/');
  await tryEndpoint('https://www.wkcoach.nl/api/game/players/?round_seq=1', 'game/players/');
  await tryEndpoint('https://www.wkcoach.nl/api/player-points/?round_seq=1', 'player-points/');
  await tryEndpoint('https://www.wkcoach.nl/api/points/?round_seq=1', 'points/');
  await tryEndpoint('https://www.wkcoach.nl/api/points/all/?round_seq=1', 'points/all/');
  await tryEndpoint('https://www.wkcoach.nl/api/stats/players/?round_seq=1', 'stats/players/');
  await tryEndpoint('https://www.wkcoach.nl/api/player/list/all/?round_seq=1', 'player/list/all/');
}

main().catch(e => console.error(e));

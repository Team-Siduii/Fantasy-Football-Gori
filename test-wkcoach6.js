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
  const lines = env.split('\n');
  let email = '', password = '';
  for (const line of lines) {
    if (line.startsWith('WKCOACH_EMAIL=')) {
      email = line.split('=').slice(1).join('=').replace(/"/g, '').trim();
    }
    if (line.startsWith('WKCOACH_PASSWORD=')) {
      password = line.split('=').slice(1).join('=').replace(/"/g, '').trim();
    }
  }
  return { email, password };
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

async function main() {
  const { email, password } = readCreds();
  if (!email || !password) { console.log('Creds not found'); return; }
  
  const ok = await login(email, password);
  if (!ok) { console.log('Login failed'); return; }
  console.log('Logged in!\n');
  
  const cookieHeader = Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ');

  // Fetch the JS bundle and search for ALL api routes
  const appRes = await fetch('https://www.wkcoach.nl/app/', {
    headers: { 'User-Agent': ua, Cookie: cookieHeader }
  });
  const appHtml = await appRes.text();
  const jsMatch = appHtml.match(/src="(\/app\/assets\/index-[^"]+\.js)"/);
  if (!jsMatch) { console.log('JS bundle not found in HTML'); return; }
  
  const jsRes = await fetch('https://www.wkcoach.nl' + jsMatch[1], { headers: { 'User-Agent': ua } });
  const js = await jsRes.text();
  
  // Search for ALL api routes in the bundle
  const apiRoutes = [...js.matchAll(/["'`](\/api\/[a-zA-Z0-9_\/?=&.%{}+:-]{5,150})["'`]/g)];
  const clean = [...new Set(apiRoutes.map(m => m[1]))].sort();
  
  console.log('API routes in JS bundle (' + clean.length + '):');
  for (const route of clean) {
    console.log(' ', route);
  }
  
  // Also search for 'player' related patterns
  console.log('\n--- Player-related code patterns ---');
  const playerPatterns = [...js.matchAll(/\/api\/[^"'\s]{0,80}player[^"'\s]{0,40}/gi)];
  const unique = [...new Set(playerPatterns.map(m => m[0]))];
  for (const p of unique.slice(0, 20)) {
    console.log(' ', p);
  }
  
  // Try the endpoints we suspect might list all players
  console.log('\n--- Trying candidate endpoints ---');
  const candidates = [
    '/api/players/',
    '/api/player/list/',
    '/api/player/points/',
    '/api/transfer/list/',
    '/api/transfer/players/',
    '/api/game/players/',
  ];
  
  for (const ep of candidates) {
    try {
      const res = await fetch('https://www.wkcoach.nl' + ep + '?round_seq=1', {
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
        try { const d = JSON.parse(text); count = Array.isArray(d) ? d.length : (d.players?.length || d.results?.length || 0); } catch {}
      }
      console.log(' ', ep.padEnd(30), res.status, isJson ? 'JSON' : 'HTML', count ? '(' + count + ' items)' : '');
      if (count > 5) {
        console.log('   FOUND LARGE DATASET!');
        console.log('   Preview:', text.substring(0, 300));
      }
    } catch(e) {
      console.log(' ', ep.padEnd(30), 'ERR:', e.message);
    }
  }
}

main().catch(e => console.error(e));

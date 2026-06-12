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
  const env = fs.readFileSync('.env.prod', 'utf-8');
  const emMatch = env.match(/WKCOACH_EMAIL="([^"]+)"/);
  const pwMatch = env.match(/WKCOACH_PASSWORD=***  if (!emMatch || !pwMatch) { console.log('Creds not found'); return; }
  const email = emMatch[1].trim();
  const password = pwMatch[1].trim();
  
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
  if (!jsMatch) { console.log('JS bundle not found'); return; }
  
  const jsRes = await fetch('https://www.wkcoach.nl' + jsMatch[1], { headers: { 'User-Agent': ua } });
  const js = await jsRes.text();
  
  // Search more broadly for API routes
  // Look for any URL pattern containing 'api'
  const apiRoutes = js.match(/["'`](\/api\/[a-zA-Z0-9_\/?=&.-]{5,120})["'`]/g) || [];
  const clean = [...new Set(apiRoutes.map(r => r.replace(/^["'`]|["'`]$/g, '')))].sort();
  
  console.log('API routes in JS bundle:');
  for (const route of clean) {
    console.log(' ', route);
  }
  
  // Also try the player search page HTML
  console.log('\n--- Trying player search pages ---');
  const searchPages = [
    '/app/players/',
    '/app/spelers/',
    '/app/search/',
    '/app/transfer/search/',
    '/app/statistics/',
    '/app/stats/',
    '/app/player-stats/',
  ];
  
  for (const page of searchPages) {
    const res = await fetch('https://www.wkcoach.nl' + page, {
      headers: { 'User-Agent': ua, Cookie: cookieHeader },
      redirect: 'manual'
    });
    console.log(page.padEnd(25), res.status, res.headers.get('location') || '');
  }
}

main().catch(e => console.error(e));

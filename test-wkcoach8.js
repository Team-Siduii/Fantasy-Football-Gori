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
  const passMatch = env.match(/WKCOACH_PASSWORD=***  return {
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

async function main() {
  const { email, password } = readCreds();
  if (!email || !password) { console.log('Creds not found'); return; }
  
  const ok = await login(email, password);
  if (!ok) { console.log('Login failed'); return; }
  console.log('Logged in!\n');
  
  const cookieHeader = Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ');
  
  // Try to find player data by looking at what the app/ page loads
  // The WKCoach SPA might have inline data or state
  const appRes = await fetch('https://www.wkcoach.nl/app/', {
    headers: { 'User-Agent': ua, Cookie: cookieHeader }
  });
  const appHtml = await appRes.text();
  
  // Look for inline scripts with data
  const scripts = appHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  console.log('Inline scripts:', scripts.length);
  for (let i = 0; i < scripts.length; i++) {
    const s = scripts[i];
    if (s.length > 100 && (s.includes('players') || s.includes('points') || s.includes('api'))) {
      console.log('Script', i, 'length:', s.length);
      console.log(s.substring(0, 500));
      console.log('...\n');
    }
  }
  
  // Try to find the SPA's route configuration
  console.log('Looking for route patterns...');
  const routePatterns = appHtml.match(/path\s*:\s*["']([^"']+)["']/g) || [];
  console.log('Route paths:', [...new Set(routePatterns)].slice(0, 20));
  
  // Check if there's a robots.txt or sitemap that reveals API endpoints
  const robotsRes = await fetch('https://www.wkcoach.nl/robots.txt', { headers: { 'User-Agent': ua } });
  if (robotsRes.ok) {
    console.log('\nrobots.txt:');
    console.log((await robotsRes.text()).substring(0, 500));
  }
}

main().catch(e => console.error(e));

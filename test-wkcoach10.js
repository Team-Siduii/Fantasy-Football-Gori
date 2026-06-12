const ua = 'Mozilla/5.0';
const cookies = {};
const EMAIL = 'simon15_@hotmail.com';
const PASS = 'Voetbal7';

function parseCookies(header) {
  if (!header) return;
  for (const part of header.split(/,\s*(?=[^;]+?=)/g)) {
    const [kv] = part.split(';');
    const idx = kv.indexOf('=');
    if (idx > 0) cookies[kv.slice(0,idx).trim()] = kv.slice(idx+1).trim();
  }
}

async function login() {
  const loginPage = await fetch('https://www.wkcoach.nl/accounts/login/', { headers: { 'User-Agent': ua } });
  parseCookies(loginPage.headers.get('set-cookie'));
  const html = await loginPage.text();
  const csrf = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1] || cookies.csrftoken;
  
  const form = new URLSearchParams();
  form.set('csrfmiddlewaretoken', csrf);
  form.set('login', EMAIL);
  form.set('password', PASS);
  
  const loginPost = await fetch('https://www.wkcoach.nl/accounts/login/', {
    method: 'POST', headers: {
      'User-Agent': ua, Referer: 'https://www.wkcoach.nl/accounts/login/',
      Origin: 'https://www.wkcoach.nl', 'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),
    },
    body: form.toString(), redirect: 'manual',
  });
  parseCookies(loginPost.headers.get('set-cookie'));
  return !!cookies.sessionid;
}

async function tryPage(path, label) {
  try {
    const res = await fetch('https://www.wkcoach.nl' + path, {
      headers: { 'User-Agent': ua, Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ') },
      redirect: 'manual'
    });
    const html = await res.text();
    
    // Look for API calls in the page (might be in <script> tags or as data-api attributes)
    const apiCalls = html.match(/\/api\/[a-zA-Z0-9_\/-]{4,100}/g) || [];
    
    // Look for data- attributes with JSON
    const dataJson = html.match(/data-[^=]+="(\{[^"]+\})"/g) || [];
    
    console.log(label.padEnd(30), 'Status:', res.status, 'Size:', html.length, 
      'APIs:', [...new Set(apiCalls)].length,
      'Data:', dataJson.length > 0 ? dataJson[0].substring(0, 100) : 'none');
  } catch(e) {
    console.log(label.padEnd(30), 'ERR:', e.message);
  }
}

async function main() {
  const ok = await login();
  if (!ok) { console.log('Login failed'); return; }
  console.log('Logged in!\n');
  
  // Try various WKCoach pages
  await tryPage('/app/', 'app/');
  await tryPage('/app/transfer/', 'app/transfer/');
  await tryPage('/app/stats/', 'app/stats/');
  await tryPage('/app/players/', 'app/players/');
  await tryPage('/app/spelers/', 'app/spelers/');
  await tryPage('/app/player-stats/', 'app/player-stats/');
  await tryPage('/app/points/', 'app/points/');
  await tryPage('/app/leaderboard/', 'app/leaderboard/');
}

main().catch(e => console.error(e));

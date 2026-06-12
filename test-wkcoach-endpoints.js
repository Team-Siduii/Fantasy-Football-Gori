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

async function fetchPage(url, label) {
  const res = await fetch(url, {
    headers: { 'User-Agent': ua, Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ') }
  });
  const html = await res.text();
  
  const apiMatches = html.match(/\/api\/[a-zA-Z0-9_\/?=&.-]+/g) || [];
  const uniqueApis = [...new Set(apiMatches)].filter(u => u.length > 15 && !u.includes('login'));
  
  console.log(label.padEnd(30), res.status, '- APIs:', uniqueApis.slice(0, 8));
  return html;
}

async function tryAPI(url, label) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': ua, Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://www.wkcoach.nl/app/',
        Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),
      }
    });
    const text = await res.text();
    const isJson = text.startsWith('{') || text.startsWith('[');
    let count = 0;
    if (isJson) {
      try { const d = JSON.parse(text); count = Array.isArray(d) ? d.length : (d.players?.length || d.results?.length || Object.keys(d).length); } catch {}
    }
    console.log('  API', label.padEnd(50), res.status, isJson ? 'JSON' : 'HTML', count > 0 ? '('+count+' items)' : '');
    if (isJson && text.length < 500) console.log('   ', text.substring(0, 200));
  } catch(e) { console.log('  API', label.padEnd(50), 'ERR', e.message); }
}

async function main() {
  const email = process.env.WKCOACH_EMAIL;
  const password = process.env.WKCOACH_PASSWORD;
  if (!email || !password) { console.log('Missing creds'); return; }
  
  const ok = await login(email, password);
  if (!ok) { console.log('Login failed'); return; }
  console.log('Logged in!\n');
  
  // Discover APIs from app pages
  await fetchPage('https://www.wkcoach.nl/app/', 'app/');
  await fetchPage('https://www.wkcoach.nl/app/transfer/', 'app/transfer/');
  
  // Try known WKCoach API patterns
  console.log('\nTrying API endpoints:');
  await tryAPI('https://www.wkcoach.nl/api/transfer/players/?round_seq=1', 'transfer/players/');
  await tryAPI('https://www.wkcoach.nl/api/players/points/?round_seq=1', 'players/points/');
  await tryAPI('https://www.wkcoach.nl/api/points/round/1/', 'points/round/1/');
  await tryAPI('https://www.wkcoach.nl/api/game/players/?round_seq=1', 'game/players/');
  await tryAPI('https://www.wkcoach.nl/api/score/players/?round_seq=1', 'score/players/');
  await tryAPI('https://www.wkcoach.nl/api/player/points/?round_seq=1', 'player/points/');
  await tryAPI('https://www.wkcoach.nl/api/stats/players/?round_seq=1', 'stats/players/');
  await tryAPI('https://www.wkcoach.nl/api/player/list/?round_seq=1', 'player/list/');
  
  // Try fetching the team/points endpoint but for ALL teams
  const prepRes = await fetch('https://www.wkcoach.nl/api/team/preparation/?round_seq=1', {
    headers: {
      'User-Agent': ua, Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest', Referer: 'https://www.wkcoach.nl/app/',
      Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),
    }
  });
  const prep = await prepRes.json();
  console.log('\nteam/preparation/ fantasycoach_id:', prep.fantasycoach_id);
}

main().catch(e => console.error(e));

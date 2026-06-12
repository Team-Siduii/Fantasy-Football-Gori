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
  const email = process.env.WKCOACH_EMAIL;
  const password = process.env.WKCOACH_PASSWORD;
  if (!email || !password) { console.log('Missing creds'); return; }
  
  const ok = await login(email, password);
  if (!ok) { console.log('Login failed'); return; }
  
  // Get the main app page and look for JS bundles that might contain API routes
  const appRes = await fetch('https://www.wkcoach.nl/app/', {
    headers: { 'User-Agent': ua, Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ') }
  });
  const appHtml = await appRes.text();
  
  // Find JS bundle URLs
  const jsBundles = appHtml.match(/src="([^"]+\.js[^"]*)"/g) || [];
  console.log('JS bundles found:', jsBundles.length);
  console.log(jsBundles.slice(0, 10).join('\n'));
  
  // Also look for inline scripts containing 'api' or 'route'
  const inlineScripts = appHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  console.log('\nInline scripts:', inlineScripts.length);
  for (const s of inlineScripts) {
    if (s.includes('api/') || s.includes('route') || s.includes('players')) {
      console.log('  Found:', s.substring(0, 200));
    }
  }
  
  // Try the fantasycoach_id approach - maybe all players points are under a different coach
  const prepRes = await fetch('https://www.wkcoach.nl/api/team/preparation/?round_seq=1', {
    headers: {
      'User-Agent': ua, Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest', Referer: 'https://www.wkcoach.nl/app/',
      Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),
    }
  });
  const prep = await prepRes.json();
  const coachId = prep.fantasycoach_id;
  console.log('\nCoach ID:', coachId);
  
  // Try getting points for coach_id=0 or without id
  const noIdRes = await fetch('https://www.wkcoach.nl/api/team/points-detailed/?round_seq=1', {
    headers: {
      'User-Agent': ua, Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest', Referer: 'https://www.wkcoach.nl/app/',
      Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),
    }
  });
  console.log('points-detailed/ (no ID):', noIdRes.status);
  
  // Try the player search autocomplete endpoint
  const searchRes = await fetch('https://www.wkcoach.nl/api/player/search/?q=a', {
    headers: {
      'User-Agent': ua, Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest', Referer: 'https://www.wkcoach.nl/app/',
      Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),
    }
  });
  console.log('player/search/?q=a:', searchRes.status);
  if (searchRes.ok) {
    const data = await searchRes.json();
    console.log('  Results:', JSON.stringify(data).substring(0, 300));
  }
  
  // Look at the static JS files for API routes
  const staticMatch = appHtml.match(/src="(\/static\/[^"]+\.js)"/g) || [];
  if (staticMatch.length > 0) {
    console.log('\nFetching main JS bundle...');
    const jsUrl = 'https://www.wkcoach.nl' + staticMatch[0].match(/src="([^"]+)"/)[1];
    const jsRes = await fetch(jsUrl, { headers: { 'User-Agent': ua } });
    const js = await jsRes.text();
    const apiRoutes = js.match(/\/api\/[a-zA-Z0-9_\/-]+/g) || [];
    const unique = [...new Set(apiRoutes)].filter(r => !r.includes('login') && !r.includes('csrf'));
    console.log('API routes in JS:', unique.slice(0, 20));
  }
}

main().catch(e => console.error(e));

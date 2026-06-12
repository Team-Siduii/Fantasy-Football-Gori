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
  const ok = await login();
  if (!ok) { console.log('Login failed'); return; }
  console.log('Logged in!\n');
  
  const cookieHeader = Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ');
  
  // Fetch all JS bundles
  const appRes = await fetch('https://www.wkcoach.nl/app/', {
    headers: { 'User-Agent': ua, Cookie: cookieHeader }
  });
  const appHtml = await appRes.text();
  
  const jsFiles = [...appHtml.matchAll(/src="(\/app\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
  console.log('JS files:', jsFiles);
  
  for (const jsFile of jsFiles.slice(0, 3)) {
    const jsRes = await fetch('https://www.wkcoach.nl' + jsFile, { headers: { 'User-Agent': ua } });
    const js = await jsRes.text();
    
    // Search for API-like strings broadly
    const patterns = [
      ...js.match(/\/api\/[a-zA-Z0-9_\/-]{4,80}/g) || [],
    ];
    const unique = [...new Set(patterns.filter(p => !p.includes('login') && !p.includes('csrf') && !p.includes('password')))];
    console.log('\n' + jsFile + ' (' + unique.length + ' API patterns):');
    for (const r of unique.slice(0, 30)) console.log('  ' + r);
  }
}

main().catch(e => console.error(e));

const ua = 'Mozilla/5.0';
const EMAIL = 'simon15_@hotmail.com';
const PASS = 'Voetbal7';
const cookies = {};

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

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': ua, Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://www.wkcoach.nl/app/',
      Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),
    }
  });
  return { status: res.status, data: res.ok ? await res.json() : null };
}

async function main() {
  const ok = await login();
  if (!ok) { console.log('Login failed'); return; }
  console.log('Logged in!\n');
  
  // Get the full preparation response
  const prep = await fetchJSON('https://www.wkcoach.nl/api/team/preparation/?round_seq=1');
  console.log('preparation keys:', Object.keys(prep.data || {}));
  console.log('preparation sample:', JSON.stringify(prep.data).substring(0, 2000));
  
  // Check if there are player lists in the response
  if (prep.data) {
    for (const key of Object.keys(prep.data)) {
      const val = prep.data[key];
      if (Array.isArray(val)) {
        console.log('  Array key:', key, 'length:', val.length);
      }
    }
  }
}

main().catch(e => console.error(e));

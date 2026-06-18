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

async function main() {
  // Step 1: GET login page
  const loginPage = await fetch('https://www.wkcoach.nl/accounts/login/', { headers: { 'User-Agent': ua } });
  parseCookies(loginPage.headers.get('set-cookie'));
  const html = await loginPage.text();
  const csrf = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1] || cookies.csrftoken;
  console.log('CSRF token found:', !!csrf);
  
  // Step 2: POST login
  const form = new URLSearchParams();
  form.set('csrfmiddlewaretoken', csrf);
  form.set('login', 'simon15_@hotmail.com');
  form.set('password', 'Voetbal7');
  
  const loginPost = await fetch('https://www.wkcoach.nl/accounts/login/', {
    method: 'POST',
    headers: {
      'User-Agent': ua, Referer: 'https://www.wkcoach.nl/accounts/login/',
      Origin: 'https://www.wkcoach.nl', 'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),
    },
    body: form.toString(), redirect: 'manual',
  });
  
  // Parse POST response cookies
  parseCookies(loginPost.headers.get('set-cookie'));
  console.log('POST status:', loginPost.status);
  console.log('sessionid:', cookies.sessionid ? 'YES' : 'NO');
  console.log('All cookies:', Object.keys(cookies).join(', '));
  
  // Also check what happens if we follow redirect
  const loginPost2 = await fetch('https://www.wkcoach.nl/accounts/login/', {
    method: 'POST',
    headers: {
      'User-Agent': ua, Referer: 'https://www.wkcoach.nl/accounts/login/',
      Origin: 'https://www.wkcoach.nl', 'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),
    },
    body: form.toString(), redirect: 'follow',
  });
  parseCookies(loginPost2.headers.get('set-cookie'));
  console.log('After follow - status:', loginPost2.status);
  console.log('After follow - sessionid:', cookies.sessionid ? 'YES' : 'NO');
  console.log('Final URL:', loginPost2.url);
  
  if (!cookies.sessionid) {
    console.log('LOGIN FAILED');
    return;
  }
  
  const cookieHeader = Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ');
  
  const res = await fetch('https://www.wkcoach.nl/api/players/search_all/1/?page=1&page_size=100&sort=-total_points', {
    headers: { 'User-Agent': ua, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', Referer: 'https://www.wkcoach.nl/app/', Cookie: cookieHeader }
  });
  const data = await res.json();
  
  console.log('\nAPI response keys:', Object.keys(data).join(', '));
  console.log('pagination:', JSON.stringify(data.pagination));
  console.log('players:', data.players?.length);
  if (data.detail) console.log('detail:', data.detail);
}
main().catch(e => console.error('ERROR:', e.message));

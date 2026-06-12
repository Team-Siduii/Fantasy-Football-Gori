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
  
  // Fetch the main JS bundle to find API routes
  const jsRes = await fetch('https://www.wkcoach.nl/app/assets/index-a5e9a550.js', {
    headers: { 'User-Agent': ua }
  });
  const js = await jsRes.text();
  
  // Search for API routes
  const apiPatterns = [
    ...js.match(/"[^"]*\/api\/[^"]{3,60}"/g) || [],
    ...js.match(/'[^']*\/api\/[^']{3,60}'/g) || [],
    ...js.match(/`[^`]*\/api\/[^`]{3,60}`/g) || [],
  ];
  
  const unique = [...new Set(apiPatterns)].filter(p => 
    !p.includes('login') && !p.includes('csrf') && !p.includes('password') && !p.includes('token')
  );
  console.log('API routes in JS bundle:');
  for (const route of unique.slice(0, 30)) {
    console.log(' ', route.substring(0, 80));
  }
  
  // Also look for 'players' references
  const playerRefs = js.match(/[^a-zA-Z]players[^a-zA-Z].{0,40}/gi) || [];
  console.log('\nPlayer references:', [...new Set(playerRefs)].slice(0, 10));
  
  // Look for endpoints that might give ALL players points
  const pointsRefs = js.match(/[^a-zA-Z]points.{0,50}/gi) || [];
  console.log('\nPoints references:', [...new Set(pointsRefs)].slice(0, 10));
}

main().catch(e => console.error(e));

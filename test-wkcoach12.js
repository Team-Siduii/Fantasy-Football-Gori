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

async function main() {
  const ok = await login();
  if (!ok) { console.log('Login failed'); return; }
  console.log('Logged in!\n');
  
  const cookieHeader = Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ');
  
  // Get the app HTML to find JS files
  const appRes = await fetch('https://www.wkcoach.nl/app/', {
    headers: { 'User-Agent': ua, Cookie: cookieHeader }
  });
  const appHtml = await appRes.text();
  
  // Look for environment variables or config embedded in HTML
  const envMatch = appHtml.match(/ENV_[A-Z_]+/g) || [];
  console.log('ENV vars in HTML:', [...new Set(envMatch)]);
  
  // Look for JSON config in HTML
  const jsonConfigs = appHtml.match(/\{[^}]{50,500}\}/g) || [];
  console.log('\nJSON configs:', jsonConfigs.length);
  for (const cfg of jsonConfigs) {
    if (cfg.includes('players') || cfg.includes('points') || cfg.includes('api')) {
      console.log('  Found:', cfg.substring(0, 200));
    }
  }
  
  // Also check the JS bundle for WK-specific files
  const jsFiles = [...appHtml.matchAll(/src="(\/app\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
  
  // Try to find a WK-specific Excel file by searching the JS
  for (const jsFile of jsFiles) {
    const jsRes = await fetch('https://www.wkcoach.nl' + jsFile, { headers: { 'User-Agent': ua } });
    const js = await jsRes.text();
    
    // Search for xlsx URLs
    const xlsxUrls = js.match(/https?:\/\/[^"'\s]+\.xlsx/g) || [];
    console.log('\n' + jsFile + ' - xlsx URLs:', [...new Set(xlsxUrls)]);
    
    // Search for any swift2019 URLs
    const swiftUrls = js.match(/swift2019[^"'\s]{0,200}/g) || [];
    if (swiftUrls.length > 0) console.log('swift URLs:', [...new Set(swiftUrls)]);
  }
}

main().catch(e => console.error(e));

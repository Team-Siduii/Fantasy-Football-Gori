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
  const pwMatch = env.match(/WKCOACH_PASSWORD="([^"]+)"/);
  if (!emMatch || !pwMatch) { console.log('Creds not found in .env.prod'); return; }
  const email = emMatch[1].trim();
  const password = pwMatch[1].trim();
  
  const ok = await login(email, password);
  if (!ok) { console.log('Login failed'); return; }
  console.log('Logged in!\n');

  const cookieHeader = Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ');
  
  // Fetch the transfer/spelerpool page
  const transferRes = await fetch('https://www.wkcoach.nl/app/transfer/', {
    headers: { 'User-Agent': ua, Cookie: cookieHeader }
  });
  const html = await transferRes.text();
  
  // Look for embedded JSON data (common in React SPAs)
  const jsonBlobs = html.match(/\{[\s\S]{50,5000}\}/g) || [];
  console.log('JSON blobs found:', jsonBlobs.length);
  for (const blob of jsonBlobs.slice(0, 5)) {
    try {
      const parsed = JSON.parse(blob);
      if (parsed.players || parsed.points || parsed.data) {
        console.log('  Players/points data:', JSON.stringify(parsed).substring(0, 300));
      }
    } catch {}
  }
  
  // Look for window.__INITIAL_STATE__ or similar
  const initState = html.match(/__INITIAL_STATE__\s*=\s*(\{[\s\S]+?\});/);
  if (initState) console.log('Found __INITIAL_STATE__:', initState[1].substring(0, 500));
  
  // Look for any array of player data
  const playerArrays = html.match(/\[[\s\S]*?"name"[\s\S]*?\]/g) || [];
  console.log('\nArrays with "name":', playerArrays.length);
  
  // Check if the page even contains any player data
  const hasPlayers = html.includes('"players"') || html.includes('"player"');
  const hasPoints = html.includes('"round_points"') || html.includes('"total_points"');
  console.log('Has "players":', hasPlayers);
  console.log('Has "points":', hasPoints);
  console.log('HTML size:', html.length);
  
  // The page might load data dynamically. Check the JS bundle for API calls
  const apiCalls = html.match(/\/api\/[a-zA-Z0-9_\/-]{5,80}/g) || [];
  console.log('\nAPI calls in HTML:', [...new Set(apiCalls)]);
  
  // Try the transfer page with round_seq param
  const pointsDetailedRes = await fetch('https://www.wkcoach.nl/api/team/points-detailed/127163/?round_seq=1', {
    headers: {
      'User-Agent': ua, Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest', Referer: 'https://www.wkcoach.nl/app/',
      Cookie: cookieHeader,
    }
  });
  const pointsData = await pointsDetailedRes.json();
  console.log('\nCurrent points-detailed players count:', pointsData.players?.length || 0);
  if (pointsData.players) {
    console.log('Sample players:', pointsData.players.slice(0, 3).map(p => p.player?.name + ' (' + p.player?.club_fullname + ') ' + p.player?.total_points + 'pts'));
  }
}

main().catch(e => console.error(e));

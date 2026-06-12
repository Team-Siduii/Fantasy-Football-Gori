const ua = 'Mozilla/5.0';

async function main() {
  // Fetch the JS bundle directly
  const jsRes = await fetch('https://www.wkcoach.nl/app/assets/index-a5e9a550.js', { headers: { 'User-Agent': ua } });
  const js = await jsRes.text();
  console.log('JS size:', js.length);
  
  // Search for fetch/axios calls with URL patterns
  // React apps commonly use patterns like: fetch("/api/...", ...) or axios.get("/api/...")
  const fetchCalls = js.match(/fetch\s*\(\s*["'`][^"'`]{5,200}["'`]/g) || [];
  console.log('\nfetch calls:', fetchCalls.length);
  for (const c of fetchCalls.slice(0, 30)) {
    // Only show ones with /api/
    if (c.includes('/api/') || c.includes('api/')) {
      console.log('  ' + c.substring(0, 100));
    }
  }
  
  // Search for URL construction patterns
  const urlPatterns = js.match(/["'`]https?:\/\/[^"'`]{10,150}["'`]/g) || [];
  console.log('\nURL patterns:', [...new Set(urlPatterns)].slice(0, 10));
  
  // Search for any string containing 'points' or 'players'
  const playerStrings = [...js.matchAll(/["'`]([^"'`]*players?[^"'`]{0,60})["'`]/gi)].map(m => m[1]);
  console.log('\nStrings with "player":', [...new Set(playerStrings)].slice(0, 20));
  
  const pointsStrings = [...js.matchAll(/["'`]([^"'`]*points[^"'`]{0,60})["'`]/gi)].map(m => m[1]);
  console.log('\nStrings with "points":', [...new Set(pointsStrings)].slice(0, 20));
  
  // Search for any 'transfer' strings
  const transferStrings = [...js.matchAll(/["'`]([^"'`]*transfer[^"'`]{0,60})["'`]/gi)].map(m => m[1]);
  console.log('\nStrings with "transfer":', [...new Set(transferStrings)].slice(0, 20));
  
  // Search for round_seq
  const roundRefs = [...js.matchAll(/[^a-zA-Z]round_seq[^a-zA-Z]/g)];
  console.log('\nround_seq references:', roundRefs.length);
  
  // Look for React Router paths
  const routes = js.match(/path\s*:\s*["']([^"']+)["']/g) || [];
  console.log('\nReact routes:', [...new Set(routes)].slice(0, 15));
}

main().catch(e => console.error(e));

const ua = "Mozilla/5.0";
const EMAIL = "simon15_@hotmail.com";
const PASS = "Voetbal7";
const cookies = {};

function pc(h) {
  if (!h) return;
  for (const p of h.split(/,\s*(?=[^;]+?=)/g)) {
    const [kv] = p.split(";"); const idx = kv.indexOf("=");
    if (idx > 0) cookies[kv.slice(0,idx).trim()] = kv.slice(idx+1).trim();
  }
}
function ch() { return Object.entries(cookies).map(([k,v])=>k+"="+v).join("; "); }

async function main() {
  const lp = await fetch("https://www.wkcoach.nl/accounts/login/", { headers: {"User-Agent": ua} });
  pc(lp.headers.get("set-cookie"));
  const html = await lp.text();
  const csrf = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1] || cookies.csrftoken;
  const form = new URLSearchParams();
  form.set("csrfmiddlewaretoken", csrf); form.set("login", EMAIL); form.set("password", PASS);
  const lp2 = await fetch("https://www.wkcoach.nl/accounts/login/", {
    method: "POST",
    headers: {"User-Agent":ua, Referer:"https://www.wkcoach.nl/accounts/login/", Origin:"https://www.wkcoach.nl", "Content-Type":"application/x-www-form-urlencoded", Cookie: ch()},
    body: form.toString(), redirect: "manual",
  });
  pc(lp2.headers.get("set-cookie"));
  const h = {"User-Agent":ua, Accept:"application/json", "X-Requested-With":"XMLHttpRequest", Referer:"https://www.wkcoach.nl/app/", Cookie: ch()};

  // Get ZA + Mexico players
  const res = await fetch("https://www.wkcoach.nl/api/players/search_all/1/?page=1&page_size=60&sort=round_points&club_id=2", { headers: h });
  const data = await res.json();
  
  const allCodes = new Map();
  
  for (const p of (data.players || [])) {
    if (!p.point_events || p.point_events.length === 0) continue;
    console.log("\n" + p.name + " (" + p.position_nl + "): " + p.round_points + " pts");
    for (const evt of p.point_events) {
      const min = evt.minute ? " (" + evt.minute + "'" + ")" : "";
      console.log("  " + evt.event_code + ": " + evt.points + " pts" + min);
      allCodes.set(evt.event_code + "=" + evt.points, true);
    }
  }
  
  console.log("\n\n=== ALL UNIQUE EVENT CODES ===");
  [...allCodes.keys()].sort().forEach(function(c) { console.log(c); });
}
main().catch(function(e) { console.error("Error:", e.message); });

const ua = "Mozilla/5.0";
const EMAIL = "simon15_@hotmail.com";
const PASS = "Voetbal7";

async function main() {
  // Use fetch() like in wkcoach.ts
  const cookies = {};
  
  function parseCookies(header) {
    if (!header) return;
    for (const part of header.split(/,\s*(?=[^;]+?=)/g)) {
      const [kv] = part.split(";");
      const idx = kv.indexOf("=");
      if (idx > 0) cookies[kv.slice(0,idx).trim()] = kv.slice(idx+1).trim();
    }
  }
  
  function cookieHeader() {
    return Object.entries(cookies).map(([k,v]) => k+"="+v).join("; ");
  }

  // Step 1: login page
  const loginPage = await fetch("https://www.wkcoach.nl/accounts/login/", {
    headers: { "User-Agent": ua },
    cache: "no-store",
  });
  parseCookies(loginPage.headers.get("set-cookie"));
  const html = await loginPage.text();
  const csrfMatch = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/);
  const csrf = csrfMatch?.[1] ?? cookies.csrftoken;
  
  // Step 2: login POST
  const form = new URLSearchParams();
  form.set("csrfmiddlewaretoken", csrf);
  form.set("login", EMAIL);
  form.set("password", PASS);
  
  const loginPost = await fetch("https://www.wkcoach.nl/accounts/login/", {
    method: "POST",
    headers: {
      "User-Agent": ua,
      Referer: "https://www.wkcoach.nl/accounts/login/",
      Origin: "https://www.wkcoach.nl",
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
    },
    body: form.toString(),
    redirect: "manual",
    cache: "no-store",
  });
  
  parseCookies(loginPost.headers.get("set-cookie"));
  console.log("cookies:", Object.keys(cookies));
  console.log("sessionid:", cookies.sessionid ? "yes" : "no");
  
  if (!cookies.sessionid) {
    console.log("Login failed — status:", loginPost.status);
    console.log("Location:", loginPost.headers.get("location"));
    return;
  }
  
  const headers = {
    "User-Agent": ua,
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://www.wkcoach.nl/app/",
    Cookie: cookieHeader(),
  };
  
  const r = await fetch("https://www.wkcoach.nl/api/players/all/?round_seq=1", { headers });
  console.log("Status:", r.status);
  const data = await r.json();
  // WKCoach returns either { players: [...] } or { "0": {...}, "1": {...}, ... }
  let all = [];
  if (Array.isArray(data.players)) {
    all = data.players;
  } else if (typeof data === "object" && data !== null) {
    all = Object.values(data).filter(v => typeof v === "object" && v !== null && v.fantasyplayer_id);
  }
  console.log("Total players:", all.length);
  
  const mexico = all.filter(p => p.club_fullname === "Mexico");
  const sa = all.filter(p => p.club_fullname === "Zuid-Afrika");
  
  console.log("\nMEXICO (" + mexico.length + " spelers):");
  mexico.sort((a,b) => a.position_nl.localeCompare(b.position_nl) || a.value - b.value);
  mexico.forEach(p => {
    console.log("  " + p.position_nl.padEnd(12) + " | €" + (p.value/1000000).toFixed(1) + "M | " + p.name);
  });
  
  console.log("\nZUID-AFRIKA (" + sa.length + " spelers):");
  sa.sort((a,b) => a.position_nl.localeCompare(b.position_nl) || a.value - b.value);
  sa.forEach(p => {
    console.log("  " + p.position_nl.padEnd(12) + " | €" + (p.value/1000000).toFixed(1) + "M | " + p.name);
  });
  
  const mxV = mexico.reduce((s,p) => s + p.value, 0);
  const saV = sa.reduce((s,p) => s + p.value, 0);
  console.log("\nTotaalwaarde Mexico: €" + (mxV/1000000).toFixed(1) + "M");
  console.log("Totaalwaarde Zuid-Afrika: €" + (saV/1000000).toFixed(1) + "M");
}
main().catch(e => console.error("Error:", e.message));

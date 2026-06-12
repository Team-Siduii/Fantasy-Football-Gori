const { chromium } = require("playwright");

const EMAIL = "simon15_@hotmail.com";
const PASS = "Voetbal7";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/opt/hermes/.playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const apiCalls = [];
  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    let body = null;
    try {
      const ct = res.headers()["content-type"] || "";
      if (ct.includes("json")) body = await res.json();
    } catch {}
    apiCalls.push({ url, status: res.status(), body });
  });

  // LOGIN
  console.log("[1] Login...");
  await page.goto("https://www.wkcoach.nl/accounts/login/", { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[name="login"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // Clear previously captured API calls
  apiCalls.length = 0;

  // STEP 2: Navigate directly to all possible player search pages
  const pagesToTry = [
    { name: "Transfers", url: "https://www.wkcoach.nl/app/transfermarkt/" },
    { name: "Players search", url: "https://www.wkcoach.nl/app/players/" },
    { name: "Search", url: "https://www.wkcoach.nl/app/search/" },
    { name: "App root", url: "https://www.wkcoach.nl/app/" },
  ];

  for (const { name, url } of pagesToTry) {
    console.log("[2] Trying:", name, url);
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Check if we're on the right page
    const pageTitle = await page.title();
    console.log("  Title:", pageTitle, "| URL:", page.url());

    // Get all navigation links
    const navLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("nav a, .nav a, .menu a, .sidebar a, header a, [class*=nav] a, [class*=menu] a"))
        .map(a => ({ text: (a.textContent || "").trim().substring(0, 50), href: a.getAttribute("href") }));
    });
    const uniqueNav = [...new Map(navLinks.filter(l => l.text).map(l => [l.text + "|" + l.href, l])).values()];
    console.log("  Nav links:");
    uniqueNav.slice(0, 15).forEach(l => console.log("    " + l.text + " → " + l.href));

    // Try to find and click "Transfermarkt" or equivalent
    const clickTargets = ["Transfermarkt", "transfermarkt", "Spelers", "Zoek spelers", "Players", "Search players"];
    for (const target of clickTargets) {
      const el = page.locator(`a:has-text("${target}"), button:has-text("${target}"), [href*="transfer"], [href*="player"]`).first();
      if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log("  → Clicking:", target);
        await el.click();
        await page.waitForTimeout(3000);
        console.log("  New URL:", page.url());
        break;
      }
    }

    // If we found new /api/ calls, stop
    if (apiCalls.length > 0) break;
  }

  // STEP 3: Look at full page HTML for hidden nav
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  console.log("\n[3] Page body preview:");
  console.log(bodyText.substring(0, 1000));

  // STEP 4: Dump all unique API calls from step 2 onward
  const uniqueApiUrls = [...new Set(apiCalls.map(c => c.url))].sort();
  console.log("\n=== NEW API CALLS (" + apiCalls.length + ") ===");
  for (const url of uniqueApiUrls) {
    const resps = apiCalls.filter(c => c.url === url);
    const r = resps[resps.length - 1]; // last response
    console.log("\n" + url + " [status=" + r.status + "]");
    if (r.body && typeof r.body === "object") {
      const keys = Array.isArray(r.body) ? "Array[" + r.body.length + "]" : Object.keys(r.body).slice(0, 20).join(", ");
      console.log("  Keys: " + keys);
      const str = JSON.stringify(r.body);
      if (str.length < 2000) console.log("  " + str);
      else console.log("  Preview: " + str.substring(0, 800) + "...");
    }
  }

  await page.screenshot({ path: "/tmp/wkcoach-transfermarkt.png", fullPage: true });
  console.log("\nScreenshot: /tmp/wkcoach-transfermarkt.png");
  await browser.close();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });

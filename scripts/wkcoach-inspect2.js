const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/opt/hermes/.playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    viewport: { width: 1920, height: 1080 },
  });
  const page = await ctx.newPage();

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

  // Login
  console.log("[1] Login...");
  await page.goto("https://www.wkcoach.nl/accounts/login/", { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[name="login"]', "simon15_@hotmail.com");
  await page.fill('input[name="password"]', "Voetbal7");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // Clear old calls
  apiCalls.length = 0;

  // Go to transfermarkt
  console.log("[2] Transfermarkt...");
  await page.goto("https://www.wkcoach.nl/app/transfermarkt/", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  apiCalls.length = 0; // clear page-load calls

  // Find ALL inputs and buttons
  console.log("[3] Finding search elements...");
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("input, textarea, select")).map(el => ({
      tag: el.tagName,
      type: el.getAttribute("type"),
      name: el.getAttribute("name"),
      placeholder: el.getAttribute("placeholder"),
      id: el.getAttribute("id"),
      class: el.getAttribute("class")?.substring(0, 80),
    }));
  });
  console.log("Inputs:", JSON.stringify(inputs, null, 2));

  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("button, [role=button], a.btn, .btn")).map(el => ({
      text: (el.textContent || "").trim().substring(0, 40),
      class: el.getAttribute("class")?.substring(0, 60),
    }));
  });
  console.log("Buttons:", buttons.filter(b => b.text).slice(0, 20).map(b => b.text));

  // Try typing in a search input
  for (const sel of ['input[type="text"]', 'input[type="search"]', 'input[placeholder*="zoek"]', 'input[placeholder*="search"]', 'input[placeholder*="speler"]', 'input[placeholder*="naam"]', 'input[name*="search"]', 'input[name*="player"]', 'input']) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
      const placeholder = await el.getAttribute("placeholder");
      const name = await el.getAttribute("name");
      console.log("  Found input:", sel, "placeholder:", placeholder, "name:", name);
      await el.click();
      await el.fill("");
      await el.type("Memphis", { delay: 100 });
      await page.waitForTimeout(3000);
      break;
    }
  }

  // Also try clicking elements that toggle search/views
  const clickTargets = ["Lijst", "Veld", "Zoek", "Filter", "Search", "Alle spelers", "Alle"];
  for (const t of clickTargets) {
    const el = page.locator(`:has-text("${t}")`).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log("  Clicking:", t);
      await el.click();
      await page.waitForTimeout(2000);
    }
  }

  // Dump NEW api calls
  console.log("\n=== NEW API CALLS (" + apiCalls.length + ") ===");
  const seen = new Set();
  for (const c of apiCalls) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    console.log("\n" + c.url + " [" + c.status + "]");
    if (c.body && typeof c.body === "object") {
      const keys = Array.isArray(c.body) ? "Array[" + c.body.length + "]" : Object.keys(c.body).slice(0, 15).join(", ");
      console.log("  Keys: " + keys);
      const str = JSON.stringify(c.body);
      if (str.length < 1500) console.log("  " + str);
      else console.log("  Preview: " + str.substring(0, 600) + "...");
    }
  }

  await page.screenshot({ path: "/tmp/wkcoach-search.png", fullPage: true });
  console.log("\nScreenshot: /tmp/wkcoach-search.png");
  await browser.close();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });

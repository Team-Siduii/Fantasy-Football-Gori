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

  // Go to Mijn Team (app root)
  console.log("[2] Mijn Team...");
  await page.goto("https://www.wkcoach.nl/app/", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  apiCalls.length = 0;

  // FULL HTML dump to understand page structure
  const allElements = await page.evaluate(() => {
    const result = [];
    // All buttons and clickable elements
    document.querySelectorAll("button, a, [role=button], [onclick], input, select").forEach(el => {
      result.push({
        tag: el.tagName,
        text: (el.textContent || "").trim().substring(0, 60),
        type: el.getAttribute("type"),
        placeholder: el.getAttribute("placeholder"),
        name: el.getAttribute("name"),
        id: el.getAttribute("id"),
        href: el.getAttribute("href"),
        class: (el.getAttribute("class") || "").substring(0, 80),
      });
    });
    return result;
  });
  
  console.log("Elements found:", allElements.length);
  const unique = allElements.filter(e => e.text);
  unique.slice(0, 40).forEach(e => {
    console.log(`  [${e.tag}] "${e.text}" | type=${e.type} | placeholder=${e.placeholder} | id=${e.id} | href=${e.href}`);
  });

  // Click "Lijst" if found
  console.log("\n[3] Trying to click 'Lijst'...");
  const lijstBtn = page.locator('button:has-text("Lijst"), a:has-text("Lijst"), [role=button]:has-text("Lijst")').first();
  if (await lijstBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("  Clicking Lijst!");
    await lijstBtn.click();
    await page.waitForTimeout(3000);
    console.log("  URL after click:", page.url());
  }

  // Try "Spelers" or "Zoek" buttons
  const targets = ["Spelers", "Zoek spelers", "Search", "Filter", "Toon alle"];
  for (const t of targets) {
    const el = page.locator(`button:has-text("${t}"), a:has-text("${t}")`).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log("  Clicking:", t);
      await el.click();
      await page.waitForTimeout(2000);
    }
  }

  // Also try the preparation API with a different param
  // The preparation endpoint has "players" key for current team
  // Maybe there's an endpoint to get ALL players with points

  // DUMP API CALLS
  console.log("\n=== API CALLS (" + apiCalls.length + ") ===");
  const seen = new Set();
  for (const c of apiCalls) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    console.log("\n" + c.url + " [" + c.status + "]");
    if (c.body && typeof c.body === "object") {
      const keys = Array.isArray(c.body) ? "Array[" + c.body.length + "]" : Object.keys(c.body).slice(0, 20).join(", ");
      console.log("  Keys: " + keys);
      const str = JSON.stringify(c.body);
      if (str.length < 2000) console.log("  " + str);
      else console.log("  Preview: " + str.substring(0, 800) + "...");
    }
  }

  await page.screenshot({ path: "/tmp/wkcoach-team-list.png", fullPage: true });
  console.log("\nScreenshot: /tmp/wkcoach-team-list.png");
  await browser.close();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });

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
  await page.goto("https://www.wkcoach.nl/accounts/login/", { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[name="login"]', "simon15_@hotmail.com");
  await page.fill('input[name="password"]', "Voetbal7");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // Go to app, clear calls
  await page.goto("https://www.wkcoach.nl/app/", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  apiCalls.length = 0;

  // Dismiss overlays, click Zoek spelers
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  const zoekBtn = page.locator('button:has-text("Zoek spelers")');
  await zoekBtn.evaluate(el => el.click());
  await page.waitForTimeout(4000);
  apiCalls.length = 0; // clear page-load calls

  // Now scroll down to find "Bekijk" buttons
  console.log("Looking for 'Bekijk' buttons...");
  const bekijkBtns = page.locator('button:has-text("Bekijk"), a:has-text("Bekijk")');
  const count = await bekijkBtns.count();
  console.log("Found:", count, "Bekijk buttons");

  if (count > 0) {
    console.log("Clicking first Bekijk...");
    await bekijkBtns.first().click({ force: true });
    await page.waitForTimeout(4000);

    // Check if a modal opened with details
    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    console.log("\n--- PAGE AFTER BEKIJK ---");
    console.log(pageText.substring(0, 1500));
  }

  // Also try clicking "Scout" or "Info" buttons
  const detailTargets = ["Scout", "Info", "Stats", "Details", "Punten"];
  for (const t of detailTargets) {
    const el = page.locator(`button:has-text("${t}"), a:has-text("${t}")`).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log("Clicking:", t);
      await el.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }

  // DUMP ALL NEW API CALLS
  console.log("\n=== NEW API CALLS (" + apiCalls.length + ") ===");
  const seen = new Set();
  for (const c of apiCalls) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    console.log("\n" + c.url + " [" + c.status + "]");
    if (c.body && typeof c.body === "object") {
      const keys = Array.isArray(c.body) ? "Array[" + c.body.length + "]" : Object.keys(c.body).slice(0, 25).join(", ");
      console.log("  Keys: " + keys);
      const str = JSON.stringify(c.body);
      if (str.length < 3000) console.log("  " + str);
      else console.log("  Preview: " + str.substring(0, 1500) + "...");
    }
  }

  await page.screenshot({ path: "/tmp/wkcoach-detail.png", fullPage: true });
  console.log("\nScreenshot: /tmp/wkcoach-detail.png");
  await browser.close();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });

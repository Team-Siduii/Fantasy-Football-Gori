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

  console.log("[1] Login...");
  await page.goto("https://www.wkcoach.nl/accounts/login/", { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[name="login"]', "simon15_@hotmail.com");
  await page.fill('input[name="password"]', "Voetbal7");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  console.log("[2] Mijn Team...");
  await page.goto("https://www.wkcoach.nl/app/", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  apiCalls.length = 0;

  // First dismiss any overlays by pressing Escape
  console.log("[3] Dismissing overlays with Escape...");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Click "Zoek spelers"
  console.log("[4] Clicking 'Zoek spelers'...");
  const zoekBtn = page.locator('button:has-text("Zoek spelers")');
  try {
    await zoekBtn.click({ timeout: 5000, force: true });
    console.log("  Clicked!");
  } catch (e) {
    console.log("  Force click failed, trying JS click...");
    await zoekBtn.evaluate(el => el.click());
  }
  await page.waitForTimeout(4000);
  console.log("  URL:", page.url());

  // Snapshot of what's on screen now
  const pageText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log("\n--- PAGE TEXT ---");
  console.log(pageText.substring(0, 2000));

  // Check if any search input appeared
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("input")).map(el => ({
      type: el.getAttribute("type"),
      placeholder: el.getAttribute("placeholder"),
      name: el.getAttribute("name"),
      id: el.getAttribute("id"),
    }));
  });
  console.log("\nInputs:", JSON.stringify(inputs));

  // Try typing in the search
  if (inputs.length > 0) {
    const searchInput = page.locator('input').first();
    await searchInput.click();
    await searchInput.fill("");
    await searchInput.type("Depay", { delay: 50 });
    await page.waitForTimeout(3000);
  }

  // Try clicking on player position/team filters
  const filterTargets = ["Alle", "Keeper", "Verdediger", "Middenvelder", "Aanvaller", "Mexico", "Nederland"];
  for (const t of filterTargets) {
    const el = page.locator(`button:has-text("${t}"), a:has-text("${t}")`).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log("  Clicking filter:", t);
      await el.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }
  }

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
      else console.log("  Preview: " + str.substring(0, 600) + "...");
    }
  }

  await page.screenshot({ path: "/tmp/wkcoach-zoek.png", fullPage: true });
  console.log("\nScreenshot: /tmp/wkcoach-zoek.png");
  await browser.close();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });

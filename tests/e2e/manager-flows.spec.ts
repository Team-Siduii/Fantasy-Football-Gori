import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, password = "gori1234") {
  await page.goto("/login");
  await page.getByLabel("Email").fill("manager@gori.local");
  await page.getByLabel("Wachtwoord").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/manager\/my-team/);
}

test.describe.serial("manager critical flows", () => {
  test("login, drag-drop lineup, transfer selection", async ({ page }) => {
    await login(page);

    const firstLineup = page.getByTestId("lineup-card-0");
    const firstBench = page.getByTestId("bench-card-0");

    const lineupNameBefore = (await firstLineup.textContent()) ?? "";
    const benchNameBefore = (await firstBench.textContent()) ?? "";

    await firstBench.dragTo(firstLineup);

    await expect(page.getByTestId("lineup-card-0")).not.toContainText(lineupNameBefore);
    await expect(page.getByTestId("lineup-card-0")).toContainText(benchNameBefore.split("PN")[0]?.trim() || "");

    await page.goto("/manager/transfer-pool");
    await page.getByTestId("transfer-search").fill("Veerman");
    await page.getByTestId("transfer-pick-0").click();
    await expect(page.getByText("klaar om binnen te halen", { exact: false })).toBeVisible();
    await expect(page.getByTestId("transfer-pick-0")).toContainText("Geselecteerd");
  });

  test("password reset end-to-end", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("manager@gori.local");
    await page.getByRole("button", { name: "Vraag reset aan" }).click();

    const resetLink = page.getByRole("link", { name: "reset-pagina" });
    await expect(resetLink).toBeVisible();

    const href = await resetLink.getAttribute("href");
    const normalizedHref = (href || "").replace("http://localhost:3000", "http://127.0.0.1:3000");
    await page.goto(normalizedHref);

    const newPassword = `GoriReset-${Date.now()}!`;
    await page.getByLabel("Nieuw wachtwoord").fill(newPassword);
    await page.getByRole("button", { name: "Sla nieuw wachtwoord op" }).click();

    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email").fill("manager@gori.local");
    await page.getByLabel("Wachtwoord").fill(newPassword);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/manager\/my-team/);
  });
});

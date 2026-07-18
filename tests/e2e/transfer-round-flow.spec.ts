import { expect, test, type Page, type Route } from "@playwright/test";

const SESSION_COOKIE = "email:manager%40gori.local";

type PlayerRecord = {
  id: string;
  naam: string;
  club: string;
  positie: "GK" | "DEF" | "MID" | "FWD";
  prijs: number;
  isActive?: boolean;
};

type TransferEntry = {
  managerId: string;
  email: string;
  displayName: string;
  teamName: string;
  rankingPosition: number;
  sellStatus: "PENDING" | "SKIPPED" | "SUBMITTED";
  sellPlayerId: string | null;
  autoSellPlayerIds?: string[];
  buyStatus: "LOCKED" | "PENDING" | "SUBMITTED" | "COMPLETED" | "RETRY_REQUIRED";
  buyPlayerIds?: string[];
  buyPlayerId: string | null;
  resolvedTransfers?: Array<{ soldPlayerId: string; boughtPlayerId: string }>;
  resolvedTransfer: { soldPlayerId: string; boughtPlayerId: string } | null;
};

type TransferPayload = {
  state: {
    phase: "SELL" | "BUY" | "AWAITING_RETRY" | "COMPLETED";
    entries: TransferEntry[];
  };
  currentEntry: TransferEntry;
  pendingManagers: Array<{ managerId: string; displayName: string; teamName: string }>;
  blockedPlayerIds: string[];
};

const squadPlayers: PlayerRecord[] = [
  { id: "gk-1", naam: "Dibu Martínez", club: "Argentinië", positie: "GK", prijs: 6 },
  { id: "def-1", naam: "Nahuel Molina", club: "Argentinië", positie: "DEF", prijs: 5.5 },
  { id: "def-2", naam: "Cristian Romero", club: "Argentinië", positie: "DEF", prijs: 5.8 },
  { id: "def-3", naam: "Nicolás Otamendi", club: "Argentinië", positie: "DEF", prijs: 5.2 },
  { id: "sell-montiel", naam: "Gonzalo Montiel", club: "Argentinië", positie: "DEF", prijs: 5.1 },
  { id: "mid-1", naam: "Rodrigo De Paul", club: "Argentinië", positie: "MID", prijs: 6.4 },
  { id: "mid-2", naam: "Alexis Mac Allister", club: "Argentinië", positie: "MID", prijs: 6.7 },
  { id: "sell-inactive", naam: "Nicolás González", club: "Argentinië", positie: "MID", prijs: 5.9, isActive: false },
  { id: "fwd-1", naam: "Lionel Messi", club: "Argentinië", positie: "FWD", prijs: 9.8 },
  { id: "fwd-2", naam: "Julián Álvarez", club: "Argentinië", positie: "FWD", prijs: 8.6 },
  { id: "fwd-3", naam: "Lautaro Martínez", club: "Argentinië", positie: "FWD", prijs: 8.2 },
  { id: "gk-2", naam: "Gerónimo Rulli", club: "Argentinië", positie: "GK", prijs: 4.4 },
  { id: "def-4", naam: "Marcos Acuña", club: "Argentinië", positie: "DEF", prijs: 5.4 },
  { id: "mid-4", naam: "Exequiel Palacios", club: "Argentinië", positie: "MID", prijs: 5 },
  { id: "def-5", naam: "Juan Foyth", club: "Argentinië", positie: "DEF", prijs: 4.7 },
];

const marketPlayers: PlayerRecord[] = [
  ...squadPlayers,
  { id: "buy-molina", naam: "Jesús Molina", club: "Mexico", positie: "MID", prijs: 5.3 },
  { id: "buy-acuna", naam: "Acuña Junior", club: "Uruguay", positie: "DEF", prijs: 5.1 },
  { id: "buy-pezzella", naam: "Germán Pezzella", club: "Argentinië", positie: "MID", prijs: 5.0 },
  { id: "buy-enzo", naam: "Enzo Fernández", club: "Argentinië", positie: "MID", prijs: 7.2 },
];

function buildTeamView(overrides?: Partial<any>) {
  return {
    formation: "4-3-3",
    lineup: squadPlayers.slice(0, 11),
    bench: squadPlayers.slice(11),
    budgetCap: 100,
    pendingSellId: null,
    pendingBuyId: null,
    hasPersistedPlayers: true,
    ...overrides,
  };
}

function createEntry(overrides?: Partial<TransferEntry>): TransferEntry {
  return {
    managerId: "manager-1",
    email: "manager@gori.local",
    displayName: "IJsbeer",
    teamName: "IJsbeer FC",
    rankingPosition: 1,
    sellStatus: "PENDING",
    sellPlayerId: null,
    autoSellPlayerIds: [],
    buyStatus: "LOCKED",
    buyPlayerIds: [],
    buyPlayerId: null,
    resolvedTransfers: [],
    resolvedTransfer: null,
    ...overrides,
  };
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installTransferFlowMocks(page: Page) {
  let teamView = buildTeamView();
  let transferPayload: TransferPayload = {
    state: {
      phase: "SELL",
      entries: [createEntry()],
    },
    currentEntry: createEntry(),
    pendingManagers: [{ managerId: "manager-1", displayName: "IJsbeer", teamName: "IJsbeer FC" }],
    blockedPlayerIds: [],
  };

  await page.route("**/api/players?**", async (route) => {
    await fulfillJson(route, { players: marketPlayers });
  });

  await page.route("**/api/wk/owned-player-ids?**", async (route) => {
    await fulfillJson(route, { ids: [] });
  });

  await page.route("**/api/wk/matches?**", async (route) => {
    await fulfillJson(route, { matches: [] });
  });

  await page.route("**/api/manager/state?**", async (route) => {
    await fulfillJson(route, { ok: true });
  });

  await page.route("**/api/manager/my-team-view?**", async (route) => {
    await fulfillJson(route, teamView);
  });

  await page.route("**/api/manager/transfer-round?**", async (route) => {
    if (route.request().method() === "GET") {
      await fulfillJson(route, transferPayload);
      return;
    }

    const body = route.request().postDataJSON() as {
      action: "submit-sell" | "submit-buy";
      playerIds?: string[];
    };

    if (body.action === "submit-sell") {
      transferPayload = {
        state: {
          phase: "BUY",
          entries: [
            createEntry({
              sellStatus: "SUBMITTED",
              sellPlayerId: "sell-montiel",
              autoSellPlayerIds: ["sell-inactive"],
              buyStatus: "PENDING",
            }),
          ],
        },
        currentEntry: createEntry({
          sellStatus: "SUBMITTED",
          sellPlayerId: "sell-montiel",
          autoSellPlayerIds: ["sell-inactive"],
          buyStatus: "PENDING",
        }),
        pendingManagers: [],
        blockedPlayerIds: [],
      };
      teamView = buildTeamView({ pendingSellId: "sell-montiel" });
      await fulfillJson(route, transferPayload);
      return;
    }

    if (body.action === "submit-buy" && transferPayload.state.phase === "BUY") {
      transferPayload = {
        state: {
          phase: "AWAITING_RETRY",
          entries: [
            createEntry({
              sellStatus: "SUBMITTED",
              sellPlayerId: "sell-montiel",
              autoSellPlayerIds: ["sell-inactive"],
              buyStatus: "RETRY_REQUIRED",
              buyPlayerIds: ["buy-molina", "buy-acuna"],
              resolvedTransfers: [{ soldPlayerId: "sell-montiel", boughtPlayerId: "buy-molina" }],
            }),
          ],
        },
        currentEntry: createEntry({
          sellStatus: "SUBMITTED",
          sellPlayerId: "sell-montiel",
          autoSellPlayerIds: ["sell-inactive"],
          buyStatus: "RETRY_REQUIRED",
          buyPlayerIds: ["buy-molina", "buy-acuna"],
          resolvedTransfers: [{ soldPlayerId: "sell-montiel", boughtPlayerId: "buy-molina" }],
        }),
        pendingManagers: [{ managerId: "manager-1", displayName: "IJsbeer", teamName: "IJsbeer FC" }],
        blockedPlayerIds: [],
      };
      teamView = buildTeamView({
        pendingSellId: "sell-inactive",
        lineup: squadPlayers.slice(0, 11).map((player) =>
          player.id === "sell-montiel" ? { ...player, id: "buy-molina", naam: "Jesús Molina", club: "Mexico", positie: "MID", prijs: 5.3 } : player,
        ),
      });
      await fulfillJson(route, transferPayload);
      return;
    }

    transferPayload = {
      state: {
        phase: "COMPLETED",
        entries: [
          createEntry({
            sellStatus: "SUBMITTED",
            sellPlayerId: "sell-montiel",
            autoSellPlayerIds: ["sell-inactive"],
            buyStatus: "COMPLETED",
            resolvedTransfers: [
              { soldPlayerId: "sell-montiel", boughtPlayerId: "buy-molina" },
              { soldPlayerId: "sell-inactive", boughtPlayerId: "buy-pezzella" },
            ],
          }),
        ],
      },
      currentEntry: createEntry({
        sellStatus: "SUBMITTED",
        sellPlayerId: "sell-montiel",
        autoSellPlayerIds: ["sell-inactive"],
        buyStatus: "COMPLETED",
        resolvedTransfers: [
          { soldPlayerId: "sell-montiel", boughtPlayerId: "buy-molina" },
          { soldPlayerId: "sell-inactive", boughtPlayerId: "buy-pezzella" },
        ],
      }),
      pendingManagers: [],
      blockedPlayerIds: [],
    };
      teamView = buildTeamView({
      pendingSellId: null,
      lineup: squadPlayers.slice(0, 11).map((player) => {
        if (player.id === "sell-montiel") {
          return { id: "buy-molina", naam: "Jesús Molina", club: "Mexico", positie: "MID", prijs: 5.3 };
        }
        if (player.id === "sell-inactive") {
          return { id: "buy-pezzella", naam: "Germán Pezzella", club: "Argentinië", positie: "MID", prijs: 5.0 };
        }
        return player;
      }),
    });
    await fulfillJson(route, transferPayload);
  });
}

async function seedManagerSession(page: Page, context: Awaited<ReturnType<Page["context"]>>) {
  await context.addCookies([
    {
      name: "ffg_manager_session",
      value: SESSION_COOKIE,
      url: "http://localhost:3000",
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);
  await installTransferFlowMocks(page);
}

async function playTransferRetryFlow(page: Page) {
  await page.goto("http://localhost:3000/manager/world-cup");

  await expect(page.getByTestId("transfer-queue-summary")).toContainText(/Verkooprij\s*0/);

  await page.getByTestId("sell-player-select").selectOption("sell-montiel");
  await page.getByTestId("sell-player-select").selectOption("sell-inactive");

  await expect(page.getByTestId("sell-queue-list")).toContainText("Gonzalo Montiel");
  await expect(page.getByTestId("sell-queue-list")).toContainText("Nicolás González");
  await page.getByTestId("sell-queue-remove-sell-inactive").click();
  await expect(page.getByTestId("sell-queue-list")).not.toContainText("Nicolás González");

  await page.getByTestId("sell-player-select").selectOption("sell-inactive");
  await page.getByRole("button", { name: "Verkooprij bevestigen" }).click();

  await expect(page.getByTestId("transfer-queue-summary")).toContainText(/Bevestigde verkopen\s*2/);
  await expect(page.getByTestId("transfer-finalized-sells")).toContainText("Gonzalo Montiel");
  await expect(page.getByTestId("transfer-finalized-sells")).toContainText("Nicolás González");
  await expect(page.getByTestId("transfer-queue-summary")).toContainText(/Open koopslots\s*2/);

  await page.getByTestId("transfer-search").fill("Molina");
  await page.getByRole("row", { name: /Jesús Molina/ }).getByRole("button", { name: "Voeg toe" }).click();
  await page.getByTestId("transfer-search").fill("Acuña");
  await page.getByRole("row", { name: /Acuña Junior/ }).getByRole("button", { name: "Voeg toe" }).click();

  await expect(page.getByTestId("buy-queue-list")).toContainText("Jesús Molina");
  await expect(page.getByTestId("buy-queue-list")).toContainText("Acuña Junior");
  await page.getByRole("button", { name: "Kooprij bevestigen" }).click();

  await expect(page.getByTestId("retry-open-slot-banner")).toContainText("Alleen je open koopslot");
  await expect(page.getByTestId("transfer-queue-summary")).toContainText(/Gewonnen aankopen\s*1/);
  await expect(page.getByTestId("transfer-queue-summary")).toContainText(/Open koopslots\s*1/);

  await page.getByTestId("transfer-search").fill("Pezzella");
  await page.getByRole("row", { name: /Germán Pezzella/ }).getByRole("button", { name: "Voeg toe" }).click();
  await expect(page.getByTestId("buy-queue-list")).toContainText("Germán Pezzella");
  await page.getByTestId("buy-queue-remove-buy-pezzella").click();
  await expect(page.getByTestId("buy-queue-remove-buy-pezzella")).toHaveCount(0);

  await page.getByRole("row", { name: /Germán Pezzella/ }).getByRole("button", { name: "Voeg toe" }).click();
  await page.getByRole("button", { name: "Kooprij bevestigen" }).click();

  await expect(page.getByTestId("transfer-queue-summary")).toContainText(/Gewonnen aankopen\s*2/);
  await expect(page.getByTestId("transfer-queue-summary")).toContainText(/Open koopslots\s*0/);
  await expect(page.getByText("Jouw transfer(s) zijn verwerkt voor deze ronde.")).toBeVisible();
}

test("sell → buy → retry flow shows clear queue UX and preserves won slots", async ({ page, context }) => {
  await seedManagerSession(page, context);
  await playTransferRetryFlow(page);
});

test("can pick a different sell after undoing the previous sell", async ({ page, context }) => {
  await seedManagerSession(page, context);
  await page.goto("http://localhost:3000/manager/world-cup");

  await page.getByTestId("sell-player-select").selectOption("sell-montiel");
  await expect(page.getByTestId("sell-queue-list")).toContainText("Gonzalo Montiel");

  await page.getByTestId("sell-queue-remove-sell-montiel").click();
  await expect(page.getByTestId("sell-queue-remove-sell-montiel")).toHaveCount(0);

  await page.getByTestId("sell-player-select").selectOption("def-1");
  await expect(page.getByTestId("sell-queue-list")).toContainText("Nahuel Molina");
  await expect(page.getByTestId("sell-queue-list")).not.toContainText("Gonzalo Montiel");
});

test("can re-add the same sell after undoing it", async ({ page, context }) => {
  await seedManagerSession(page, context);
  await page.goto("http://localhost:3000/manager/world-cup");

  await page.getByTestId("sell-player-select").selectOption("sell-montiel");
  await expect(page.getByTestId("sell-queue-list")).toContainText("Gonzalo Montiel");

  await page.getByTestId("sell-queue-remove-sell-montiel").click();
  await expect(page.getByTestId("sell-queue-remove-sell-montiel")).toHaveCount(0);

  await page.getByTestId("sell-player-select").selectOption("sell-montiel");
  await expect(page.getByTestId("sell-queue-list")).toContainText("Gonzalo Montiel");
});

test("can pick a new sell after clearing the whole sell queue", async ({ page, context }) => {
  await seedManagerSession(page, context);
  await page.goto("http://localhost:3000/manager/world-cup");

  await page.getByTestId("sell-player-select").selectOption("sell-montiel");
  await page.getByRole("button", { name: "Undo verkooprij" }).click();
  await expect(page.getByTestId("sell-queue-list")).toHaveCount(0);

  await page.getByTestId("sell-player-select").selectOption("def-1");
  await expect(page.getByTestId("sell-queue-list")).toContainText("Nahuel Molina");
});

test("mobile retry flow keeps queue UX readable without horizontal overflow", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedManagerSession(page, context);
  await page.goto("http://localhost:3000/manager/world-cup");

  await page.getByTestId("sell-player-select").selectOption("sell-montiel");
  await page.getByTestId("sell-player-select").selectOption("sell-inactive");
  await page.getByRole("button", { name: "Verkooprij bevestigen" }).click();

  await page.getByTestId("transfer-search").fill("Molina");
  await page.getByRole("row", { name: /Jesús Molina/ }).getByRole("button", { name: "Voeg toe" }).click();
  await page.getByTestId("transfer-search").fill("Acuña");
  await page.getByRole("row", { name: /Acuña Junior/ }).getByRole("button", { name: "Voeg toe" }).click();
  await page.getByRole("button", { name: "Kooprij bevestigen" }).click();

  await expect(page.getByTestId("retry-open-slot-banner")).toContainText("Alleen je open koopslot");
  await expect(page.getByTestId("transfer-finalized-sells")).toContainText("Gonzalo Montiel");
  await expect(page.getByTestId("transfer-finalized-sells")).toContainText("Nicolás González");

  await page.getByTestId("transfer-search").fill("Pezzella");
  await page.getByRole("row", { name: /Germán Pezzella/ }).getByRole("button", { name: "Voeg toe" }).click();
  await expect(page.getByTestId("buy-queue-list")).toContainText("Germán Pezzella");

  const summaryColumnCount = await page.getByTestId("transfer-queue-summary").evaluate((node) => {
    const columns = getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
    return columns.length;
  });
  expect(summaryColumnCount).toBe(2);

  const overflow = await page.locator("#transfermarkt").evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

  const buyQueueBounds = await page.getByTestId("buy-queue-list").locator("li").first().evaluate((node) => {
    const button = node.querySelector("button");
    const itemRect = node.getBoundingClientRect();
    const buttonRect = button?.getBoundingClientRect();
    return {
      itemRight: itemRect.right,
      buttonRight: buttonRect?.right ?? 0,
    };
  });
  expect(buyQueueBounds.buttonRight).toBeLessThanOrEqual(buyQueueBounds.itemRight);

  const finalizedSellBounds = await page.getByTestId("transfer-finalized-sells").locator("li").first().evaluate((node) => {
    const itemRect = node.getBoundingClientRect();
    const copy = node.querySelector("div");
    const copyRect = copy?.getBoundingClientRect();
    return {
      itemRight: itemRect.right,
      copyRight: copyRect?.right ?? 0,
    };
  });
  expect(finalizedSellBounds.copyRight).toBeLessThanOrEqual(finalizedSellBounds.itemRight);
});

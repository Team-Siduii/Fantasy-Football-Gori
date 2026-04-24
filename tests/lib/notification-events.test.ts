import { existsSync, mkdirSync, unlinkSync } from "fs";
import { dirname } from "path";
import { afterEach, describe, expect, it } from "vitest";

const testPath = "/tmp/ffg-notification-events-tests/events.json";

afterEach(() => {
  process.env.NOTIFICATION_EVENTS_PATH = testPath;
  if (existsSync(testPath)) {
    unlinkSync(testPath);
  }
  delete process.env.NOTIFICATION_EVENTS_PATH;
});

describe("notification event bus v1", () => {
  it("stores transfer window events and filters per manager", async () => {
    mkdirSync(dirname(testPath), { recursive: true });
    process.env.NOTIFICATION_EVENTS_PATH = testPath;

    const mod = await import("../../src/lib/notification-events");

    mod.recordNotificationEvent({
      type: "TRANSFER_WINDOW_OPENED",
      leagueId: "league-1",
      managerId: "manager-a",
      payload: { roundNumber: 12 },
      createdAt: "2026-04-24T10:00:00.000Z",
    });

    mod.recordNotificationEvent({
      type: "TRANSFER_WINDOW_CLOSING_SOON",
      leagueId: "league-1",
      managerId: "manager-b",
      payload: { roundNumber: 12, minutesLeft: 60 },
      createdAt: "2026-04-24T11:00:00.000Z",
    });

    const managerAEvents = mod.readNotificationEvents({ managerId: "manager-a" });

    expect(managerAEvents).toHaveLength(1);
    expect(managerAEvents[0].type).toBe("TRANSFER_WINDOW_OPENED");
  });

  it("stores trade approval requests and supports type filtering", async () => {
    mkdirSync(dirname(testPath), { recursive: true });
    process.env.NOTIFICATION_EVENTS_PATH = testPath;

    const mod = await import("../../src/lib/notification-events");

    mod.recordNotificationEvent({
      type: "TRADE_APPROVAL_REQUESTED",
      leagueId: "league-1",
      managerId: "manager-c",
      payload: { proposalId: "proposal-1" },
      createdAt: "2026-04-24T12:00:00.000Z",
    });

    mod.recordNotificationEvent({
      type: "TRANSFER_WINDOW_OPENED",
      leagueId: "league-1",
      managerId: "manager-c",
      payload: { roundNumber: 13 },
      createdAt: "2026-04-24T12:05:00.000Z",
    });

    const onlyTrade = mod.readNotificationEvents({ types: ["TRADE_APPROVAL_REQUESTED"] });

    expect(onlyTrade).toHaveLength(1);
    expect(onlyTrade[0].payload).toEqual({ proposalId: "proposal-1" });
  });
});

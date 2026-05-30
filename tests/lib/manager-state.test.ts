import { existsSync, mkdirSync, unlinkSync } from "fs";
import { dirname } from "path";
import { afterEach, describe, expect, it } from "vitest";

const testPath = "/tmp/ffg-manager-state-tests/manager-state.json";

afterEach(() => {
  process.env.MANAGER_STATE_PATH = testPath;
  process.env.MANAGER_STATE_WK_PATH = "/tmp/ffg-manager-state-tests/manager-state-wk.json";
  if (existsSync(testPath)) {
    unlinkSync(testPath);
  }
  if (existsSync(process.env.MANAGER_STATE_WK_PATH)) {
    unlinkSync(process.env.MANAGER_STATE_WK_PATH);
  }
  delete process.env.MANAGER_STATE_PATH;
  delete process.env.MANAGER_STATE_WK_PATH;
});

describe("manager-state persistence", () => {
  it("saves and reads formation + selected transfer", async () => {
    mkdirSync(dirname(testPath), { recursive: true });
    process.env.MANAGER_STATE_PATH = testPath;

    const mod = await import("../../src/lib/manager-state");

    const saved = mod.saveManagerState({
      formation: "4-4-2",
      lineupIds: ["1", "2"],
      benchIds: ["3"],
      pickedTransferId: "99",
      pendingSellId: "2",
      pendingBuyId: "99",
    });

    expect(saved.formation).toBe("4-4-2");
    const read = mod.readManagerState();
    expect(read.pickedTransferId).toBe("99");
    expect(read.pendingSellId).toBe("2");
    expect(read.pendingBuyId).toBe("99");
    expect(read.lineupIds).toEqual(["1", "2"]);
  });

  it("locks and unlocks a round while storing audit entries", async () => {
    mkdirSync(dirname(testPath), { recursive: true });
    process.env.MANAGER_STATE_PATH = testPath;

    const mod = await import("../../src/lib/manager-state");

    const locked = mod.setRoundLock({
      roundNumber: 12,
      locked: true,
      reason: "deadline bereikt",
      actorId: "admin-1",
      at: "2026-04-23T10:00:00.000Z",
    });

    expect(mod.isRoundLocked(12)).toBe(true);
    expect(locked.roundLocks).toEqual([
      {
        roundNumber: 12,
        locked: true,
        reason: "deadline bereikt",
        updatedBy: "admin-1",
        updatedAt: "2026-04-23T10:00:00.000Z",
      },
    ]);

    const unlocked = mod.setRoundLock({
      roundNumber: 12,
      locked: false,
      reason: "admin override",
      actorId: "admin-2",
      at: "2026-04-23T11:00:00.000Z",
    });

    expect(mod.isRoundLocked(12)).toBe(false);
    expect(unlocked.adminActionLog).toHaveLength(2);
    expect(unlocked.adminActionLog[0].actionType).toBe("ROUND_LOCKED");
    expect(unlocked.adminActionLog[1].actionType).toBe("ROUND_UNLOCKED");
  });

  it("stores eredivisie and wk manager states separately", async () => {
    mkdirSync(dirname(testPath), { recursive: true });
    process.env.MANAGER_STATE_PATH = testPath;
    process.env.MANAGER_STATE_WK_PATH = "/tmp/ffg-manager-state-tests/manager-state-wk.json";

    const mod = await import("../../src/lib/manager-state");
    mod.resetManagerStateForTests("eredivisie");
    mod.resetManagerStateForTests("wk");

    mod.saveManagerState({ formation: "4-4-2", lineupIds: ["edv-1"] }, "eredivisie");
    mod.saveManagerState({ formation: "3-5-2", lineupIds: ["wk-1"] }, "wk");

    const eredivisieState = mod.readManagerState("eredivisie");
    const wkState = mod.readManagerState("wk");

    expect(eredivisieState.formation).toBe("4-4-2");
    expect(eredivisieState.lineupIds).toEqual(["edv-1"]);
    expect(wkState.formation).toBe("3-5-2");
    expect(wkState.lineupIds).toEqual(["wk-1"]);
  });

  it("resolves dedicated env paths per mode", async () => {
    process.env.MANAGER_STATE_PATH = "/tmp/eredivisie-state.json";
    process.env.MANAGER_STATE_WK_PATH = "/tmp/wk-state.json";

    const mod = await import("../../src/lib/manager-state");

    expect(mod.resolveManagerStatePath("eredivisie")).toBe("/tmp/eredivisie-state.json");
    expect(mod.resolveManagerStatePath("wk")).toBe("/tmp/wk-state.json");
  });

  it("keeps round lineup persistent and propagates changes to future rounds", async () => {
    mkdirSync(dirname(testPath), { recursive: true });
    process.env.MANAGER_STATE_PATH = testPath;

    const mod = await import("../../src/lib/manager-state");

    mod.saveManagerStateForRound(4, {
      formation: "4-3-3",
      lineupIds: ["r4-a", "r4-b"],
      benchIds: ["r4-c"],
    });

    mod.saveManagerStateForRound(5, {
      formation: "4-4-2",
      lineupIds: ["r5-a", "r5-b"],
      benchIds: ["r5-c"],
    });

    const round6Before = mod.readManagerStateForRound(6);
    expect(round6Before.lineupIds).toEqual(["r5-a", "r5-b"]);

    mod.saveManagerStateForRound(5, {
      formation: "3-5-2",
      lineupIds: ["r5-new-a", "r5-new-b"],
      benchIds: ["r5-new-c"],
    });

    const round5After = mod.readManagerStateForRound(5);
    const round6After = mod.readManagerStateForRound(6);

    expect(round5After.formation).toBe("3-5-2");
    expect(round5After.lineupIds).toEqual(["r5-new-a", "r5-new-b"]);
    expect(round6After.lineupIds).toEqual(["r5-new-a", "r5-new-b"]);
  });
});

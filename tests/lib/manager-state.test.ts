import { existsSync, mkdirSync, unlinkSync } from "fs";
import { dirname } from "path";
import { afterEach, describe, expect, it } from "vitest";

const testPath = "/tmp/ffg-manager-state-tests/manager-state.json";

afterEach(() => {
  process.env.MANAGER_STATE_PATH = testPath;
  if (existsSync(testPath)) {
    unlinkSync(testPath);
  }
  delete process.env.MANAGER_STATE_PATH;
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
});

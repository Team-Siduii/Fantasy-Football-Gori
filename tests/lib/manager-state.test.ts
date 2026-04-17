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
    });

    expect(saved.formation).toBe("4-4-2");
    const read = mod.readManagerState();
    expect(read.pickedTransferId).toBe("99");
    expect(read.lineupIds).toEqual(["1", "2"]);
  });
});

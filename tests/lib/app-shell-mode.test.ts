import { describe, expect, it } from "vitest";
import { resolveAppShellMode } from "../../src/lib/app-shell-mode";

describe("app shell mode resolution", () => {
  it("keeps explicit WK manager routes in WK mode", () => {
    expect(resolveAppShellMode("/manager/world-cup", "eredivisie")).toBe("wk");
    expect(resolveAppShellMode("/manager/world-cup/league", "eredivisie")).toBe("wk");
  });

  it("keeps explicit Eredivisie routes in Eredivisie mode", () => {
    expect(resolveAppShellMode("/manager/my-team", "wk")).toBe("eredivisie");
    expect(resolveAppShellMode("/draft", "wk")).toBe("eredivisie");
  });

  it("uses preferred mode on neutral pages like account/settings", () => {
    expect(resolveAppShellMode("/account", "wk")).toBe("wk");
    expect(resolveAppShellMode("/instellingen", "eredivisie")).toBe("eredivisie");
  });
});

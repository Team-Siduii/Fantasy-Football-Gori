import { describe, expect, it } from "vitest";
import { getHeaderMenuItems } from "../../src/lib/app-shell-menu";

describe("app shell header menu", () => {
  it("shows only log in when no manager is authenticated", () => {
    expect(getHeaderMenuItems(false, false)).toEqual([{ href: "/login", label: "Log in" }]);
  });

  it("shows manager-only options after login", () => {
    expect(getHeaderMenuItems(true, false).map((item) => item.label)).toEqual([
      "Draft",
      "Naam aanpassen",
      "Instellingen",
      "Spelregels",
      "CSV import",
    ]);
  });

  it("uses the WK draft route in WK mode", () => {
    expect(getHeaderMenuItems(true, true)[0]).toMatchObject({ href: "/manager/world-cup/draft", label: "Draft" });
  });
});

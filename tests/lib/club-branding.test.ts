import { describe, expect, it } from "vitest";
import { getClubBranding, resolveClubBrandingName } from "../../src/lib/club-branding";

describe("club branding", () => {
  it("resolves canonical branding for promoted Eredivisie clubs", () => {
    expect(getClubBranding("ADO Den Haag")).toMatchObject({ badgeCode: "ADO", shirtClass: "ado" });
    expect(getClubBranding("Cambuur")).toMatchObject({ badgeCode: "CAM", shirtClass: "cam" });
    expect(getClubBranding("Willem II")).toMatchObject({ badgeCode: "WIL", shirtClass: "wil" });
  });

  it("normalises common long-form club aliases", () => {
    expect(resolveClubBrandingName("Go Ahead Eagles")).toBe("Go Ahead");
    expect(resolveClubBrandingName("SC Heerenveen")).toBe("Heerenveen");
    expect(resolveClubBrandingName("FC Utrecht")).toBe("Utrecht");
  });
});

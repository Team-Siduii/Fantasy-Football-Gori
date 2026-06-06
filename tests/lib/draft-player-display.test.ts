import { describe, expect, it } from "vitest";
import { getDraftPlayerDisplayMeta } from "../../src/lib/draft-player-display";

describe("draft player display meta", () => {
  it("shows a stable country flag image for WK country players", () => {
    expect(
      getDraftPlayerDisplayMeta({ naam: "Kylian Mbappé", positie: "FWD", club: "Frankrijk", prijs: 4.5 }),
    ).toEqual({
      name: "Kylian Mbappé",
      meta: "FWD · Frankrijk",
      priceLabel: "€4.5M",
      flagImageUrl: "https://flagcdn.com/24x18/fr.png",
      flagAlt: "Vlag Frankrijk",
    });
  });

  it("keeps Eredivisie club players without a flag image", () => {
    expect(
      getDraftPlayerDisplayMeta({ naam: "Joey Veerman", positie: "MID", club: "PSV", prijs: 3.2 }),
    ).toMatchObject({
      name: "Joey Veerman",
      meta: "MID · PSV",
      priceLabel: "€3.2M",
      flagImageUrl: "",
      flagAlt: "",
    });
  });
});

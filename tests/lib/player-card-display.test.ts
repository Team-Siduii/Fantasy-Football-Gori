import { describe, expect, it } from "vitest";
import { getPlayerCardMeta } from "../../src/lib/player-card-display";

describe("getPlayerCardMeta", () => {
  it("shows flag + country abbreviation + price for filled WK player cards", () => {
    const meta = getPlayerCardMeta({
      id: "237",
      naam: "Kylian Mbappé",
      club: "Frankrijk",
      prijs: 15,
      positie: "FWD",
    });

    expect(meta.flag).toBe("🇫🇷");
    expect(meta.countryCode).toBe("FR");
    expect(meta.brandLabel).toBe("");
    expect(meta.shirtClass).toBe("");
    expect(meta.priceLabel).toBe("€ 15.00M");
    expect(meta.displayName).toBe("Kylian Mbappé");
  });

  it("adds Eredivisie club branding to player cards", () => {
    const meta = getPlayerCardMeta({
      id: "401",
      naam: "Don-Angelo Konadu",
      club: "Ajax",
      prijs: 1.75,
      positie: "FWD",
    });

    expect(meta.flag).toBe("FWD");
    expect(meta.countryCode).toBe("");
    expect(meta.brandLabel).toBe("AJA");
    expect(meta.brandTitle).toBe("Ajax");
    expect(meta.shirtClass).toBe("aja");
    expect(meta.priceLabel).toBe("€ 1.75M");
  });

  it("keeps open slots visually empty in top and bottom rows", () => {
    const meta = getPlayerCardMeta({
      id: "open-fwd-1",
      naam: "Open slot",
      club: "Voeg speler toe",
      prijs: 0,
      positie: "FWD",
    });

    expect(meta.flag).toBe("");
    expect(meta.countryCode).toBe("");
    expect(meta.brandLabel).toBe("");
    expect(meta.shirtClass).toBe("");
    expect(meta.priceLabel).toBe("");
    expect(meta.displayName).toBe("");
  });
});

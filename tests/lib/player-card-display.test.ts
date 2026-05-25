import { describe, expect, it } from "vitest";
import { getPlayerCardMeta } from "../../src/lib/player-card-display";

describe("getPlayerCardMeta", () => {
  it("shows flag + country abbreviation + price for filled player cards", () => {
    const meta = getPlayerCardMeta({
      id: "237",
      naam: "Kylian Mbappé",
      club: "Frankrijk",
      prijs: 15,
    });

    expect(meta.flag).toBe("🇫🇷");
    expect(meta.countryCode).toBe("FR");
    expect(meta.priceLabel).toBe("€ 15.00M");
  });

  it("keeps open slots visually empty in top and bottom rows", () => {
    const meta = getPlayerCardMeta({
      id: "open-fwd-1",
      naam: "Open slot",
      club: "Voeg speler toe",
      prijs: 0,
    });

    expect(meta.flag).toBe("");
    expect(meta.countryCode).toBe("");
    expect(meta.priceLabel).toBe("");
  });
});

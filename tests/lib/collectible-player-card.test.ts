import { describe, expect, it } from "vitest";
import { getCollectibleCardExample } from "../../src/lib/collectible-player-card";

describe("getCollectibleCardExample", () => {
  it("returns france as first example with layered assets", () => {
    const card = getCollectibleCardExample("france");

    expect(card.name).toBe("KYLIAN MBAPPÉ");
    expect(card.country).toBe("Frankrijk");
    expect(card.flagAsset).toBe("/assets/cards/france-flag.svg");
    expect(card.shirtAsset).toBe("/assets/cards/france-shirt.svg");
    expect(card.badgeAsset).toBe("/assets/cards/gold-shield.svg");
  });
});

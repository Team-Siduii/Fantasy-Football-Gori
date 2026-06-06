import { describe, expect, it } from "vitest";
import { getCountryAbbreviation, getCountryFlag, getCountryFlagImageUrl } from "../../src/lib/country-flags";

describe("getCountryFlag", () => {
  it("returns a flag for all WK countries", () => {
    const countries = [
      "Algerije",
      "Argentinië",
      "Australië",
      "België",
      "Bosnië en Herzegovina",
      "Brazilië",
      "Canada",
      "Colombia",
      "Curaçao",
      "Democratische Republiek Congo",
      "Duitsland",
      "Ecuador",
      "Egypte",
      "Engeland",
      "Frankrijk",
      "Ghana",
      "Haïti",
      "Irak",
      "Iran",
      "Ivoorkust",
      "Japan",
      "Jordanië",
      "Kaapverdië",
      "Kroatië",
      "Marokko",
      "Mexico",
      "Nederland",
      "Nieuw-Zeeland",
      "Noorwegen",
      "Oezbekistan",
      "Oostenrijk",
      "Panama",
      "Paraguay",
      "Portugal",
      "Qatar",
      "Saudi-Arabië",
      "Schotland",
      "Senegal",
      "Spanje",
      "Tsjechië",
      "Tunesië",
      "Turkije",
      "Uruguay",
      "Verenigde Staten",
      "Zuid-Afrika",
      "Zuid-Korea",
      "Zweden",
      "Zwitserland",
    ];

    for (const country of countries) {
      expect(getCountryFlag(country), `missing flag for ${country}`).not.toBe("");
    }
  });

  it("supports known aliases and returns empty for non-country club", () => {
    expect(getCountryFlag("Bosnië-Herzegovina")).toBe("🇧🇦");
    expect(getCountryFlag("Saoedi-Arabië")).toBe("🇸🇦");
    expect(getCountryFlag("Ajax")).toBe("");
  });
});

describe("getCountryAbbreviation", () => {
  it("returns uppercase country abbreviations for WK countries", () => {
    expect(getCountryAbbreviation("Nederland")).toBe("NL");
    expect(getCountryAbbreviation("Saoedi-Arabië")).toBe("SA");
  });

  it("returns empty for non-country clubs", () => {
    expect(getCountryAbbreviation("Ajax")).toBe("");
  });
});

describe("getCountryFlagImageUrl", () => {
  it("returns stable image URLs for transfer overview flag icons", () => {
    expect(getCountryFlagImageUrl("Nederland")).toBe("https://flagcdn.com/24x18/nl.png");
    expect(getCountryFlagImageUrl("Engeland")).toBe("https://flagcdn.com/24x18/gb-eng.png");
    expect(getCountryFlagImageUrl("Schotland")).toBe("https://flagcdn.com/24x18/gb-sct.png");
  });

  it("returns empty for non-country clubs", () => {
    expect(getCountryFlagImageUrl("Ajax")).toBe("");
  });
});

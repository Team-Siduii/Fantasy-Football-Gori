import { getCountryFlagImageUrl } from "./country-flags";

export type DraftPlayerDisplayInput = {
  naam: string;
  positie: "GK" | "DEF" | "MID" | "FWD";
  club: string;
  prijs: number;
};

export function getDraftPlayerDisplayMeta(player: DraftPlayerDisplayInput) {
  const flagImageUrl = getCountryFlagImageUrl(player.club);

  return {
    name: player.naam,
    meta: `${player.positie} · ${player.club}`,
    priceLabel: `€${player.prijs.toFixed(1)}M`,
    flagImageUrl,
    flagAlt: flagImageUrl ? `Vlag ${player.club}` : "",
  };
}

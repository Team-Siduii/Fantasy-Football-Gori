import { getCountryAbbreviation, getCountryFlag } from "./country-flags";

type PlayerCardInput = {
  id: string;
  naam: string;
  club: string;
  prijs: number;
};

export function getPlayerCardMeta(player: PlayerCardInput) {
  const isOpenSlot = player.id.startsWith("open-");
  if (isOpenSlot) {
    return {
      flag: "",
      countryCode: "",
      priceLabel: "",
      displayName: "",
    };
  }

  return {
    flag: getCountryFlag(player.club),
    countryCode: getCountryAbbreviation(player.club),
    priceLabel: `€ ${player.prijs.toFixed(2)}M`,
    displayName: player.naam,
  };
}

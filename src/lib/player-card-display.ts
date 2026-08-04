import { getCountryAbbreviation, getCountryFlag } from "./country-flags";
import { getClubBranding } from "./club-branding";

type PlayerCardInput = {
  id: string;
  naam: string;
  club: string;
  prijs: number;
  positie?: string;
};

type PlayerCardMeta = {
  flag: string;
  countryCode: string;
  brandLabel: string;
  brandTitle: string;
  shirtClass: string;
  priceLabel: string;
  displayName: string;
};

export function getPlayerCardMeta(player: PlayerCardInput): PlayerCardMeta {
  const isOpenSlot = player.id.startsWith("open-");
  if (isOpenSlot) {
    return {
      flag: "",
      countryCode: "",
      brandLabel: "",
      brandTitle: "",
      shirtClass: "",
      priceLabel: "",
      displayName: "",
    };
  }

  const countryFlag = getCountryFlag(player.club);
  if (countryFlag) {
    return {
      flag: countryFlag,
      countryCode: getCountryAbbreviation(player.club),
      brandLabel: "",
      brandTitle: "",
      shirtClass: "",
      priceLabel: `€ ${player.prijs.toFixed(2)}M`,
      displayName: player.naam,
    };
  }

  const branding = getClubBranding(player.club);

  return {
    flag: player.positie ?? "",
    countryCode: "",
    brandLabel: branding?.badgeCode ?? player.club.slice(0, 3).toUpperCase(),
    brandTitle: branding?.canonicalName ?? player.club,
    shirtClass: branding?.shirtClass ?? "default",
    priceLabel: `€ ${player.prijs.toFixed(2)}M`,
    displayName: player.naam,
  };
}

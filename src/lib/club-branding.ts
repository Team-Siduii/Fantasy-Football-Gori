const EREDIVISIE_BRANDING = {
  Telstar: { badgeCode: "TEL", shirtClass: "tel" },
  "ADO Den Haag": { badgeCode: "ADO", shirtClass: "ado" },
  Cambuur: { badgeCode: "CAM", shirtClass: "cam" },
  "Willem II": { badgeCode: "WIL", shirtClass: "wil" },
  Sparta: { badgeCode: "SPA", shirtClass: "spa" },
  "Go Ahead": { badgeCode: "GAE", shirtClass: "gae" },
  AZ: { badgeCode: "AZ", shirtClass: "az" },
  PSV: { badgeCode: "PSV", shirtClass: "psv" },
  PEC: { badgeCode: "PEC", shirtClass: "pec" },
  Feyenoord: { badgeCode: "FEY", shirtClass: "fey" },
  Groningen: { badgeCode: "GRO", shirtClass: "gro" },
  Heerenveen: { badgeCode: "HEE", shirtClass: "hee" },
  Fortuna: { badgeCode: "FOR", shirtClass: "for" },
  NAC: { badgeCode: "NAC", shirtClass: "nac" },
  Ajax: { badgeCode: "AJA", shirtClass: "aja" },
  Twente: { badgeCode: "TWE", shirtClass: "twe" },
  NEC: { badgeCode: "NEC", shirtClass: "nec" },
  Excelsior: { badgeCode: "EXC", shirtClass: "exc" },
  Utrecht: { badgeCode: "UTR", shirtClass: "utr" },
  Heracles: { badgeCode: "HER", shirtClass: "her" },
  Volendam: { badgeCode: "VOL", shirtClass: "vol" },
} as const;

const EREDIVISIE_ALIASES: Record<string, keyof typeof EREDIVISIE_BRANDING> = {
  "SC Telstar": "Telstar",
  "ADO": "ADO Den Haag",
  "SC Cambuur": "Cambuur",
  "Go Ahead Eagles": "Go Ahead",
  "Sparta Rotterdam": "Sparta",
  "PSV Eindhoven": "PSV",
  "PEC Zwolle": "PEC",
  "FC Groningen": "Groningen",
  "SC Heerenveen": "Heerenveen",
  "sc Heerenveen": "Heerenveen",
  "Fortuna Sittard": "Fortuna",
  "NAC Breda": "NAC",
  "AFC Ajax": "Ajax",
  "FC Twente": "Twente",
  "NEC Nijmegen": "NEC",
  "Excelsior Rotterdam": "Excelsior",
  "FC Utrecht": "Utrecht",
  "Heracles Almelo": "Heracles",
  "FC Volendam": "Volendam",
  "Willem II Tilburg": "Willem II",
};

export type ClubBranding = {
  canonicalName: string;
  badgeCode: string;
  shirtClass: string;
};

export function resolveClubBrandingName(club: string) {
  if (club in EREDIVISIE_BRANDING) {
    return club as keyof typeof EREDIVISIE_BRANDING;
  }
  return EREDIVISIE_ALIASES[club] ?? null;
}

export function getClubBranding(club: string): ClubBranding | null {
  const canonicalName = resolveClubBrandingName(club);
  if (!canonicalName) {
    return null;
  }

  const branding = EREDIVISIE_BRANDING[canonicalName];
  return {
    canonicalName,
    badgeCode: branding.badgeCode,
    shirtClass: branding.shirtClass,
  };
}

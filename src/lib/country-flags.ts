const COUNTRY_TO_ISO2: Record<string, string> = {
  Algerije: "DZ",
  "Argentinië": "AR",
  Australië: "AU",
  "België": "BE",
  "Bosnië en Herzegovina": "BA",
  "Bosnië-Herzegovina": "BA",
  "Brazilië": "BR",
  Canada: "CA",
  Colombia: "CO",
  "Curaçao": "CW",
  "Democratische Republiek Congo": "CD",
  Duitsland: "DE",
  Ecuador: "EC",
  Egypte: "EG",
  Engeland: "GB",
  Frankrijk: "FR",
  Ghana: "GH",
  "Haïti": "HT",
  Irak: "IQ",
  Iran: "IR",
  Ivoorkust: "CI",
  Japan: "JP",
  "Jordanië": "JO",
  Kaapverdië: "CV",
  "Kroatië": "HR",
  Marokko: "MA",
  Mexico: "MX",
  Nederland: "NL",
  "Nieuw-Zeeland": "NZ",
  Noorwegen: "NO",
  Oezbekistan: "UZ",
  Oostenrijk: "AT",
  Panama: "PA",
  Paraguay: "PY",
  Portugal: "PT",
  Qatar: "QA",
  "Saudi-Arabië": "SA",
  "Saoedi-Arabië": "SA",
  Schotland: "GB",
  Senegal: "SN",
  Spanje: "ES",
  "Tsjechië": "CZ",
  "Tunesië": "TN",
  Turkije: "TR",
  Uruguay: "UY",
  "Verenigde Staten": "US",
  "Zuid-Afrika": "ZA",
  "Zuid-Korea": "KR",
  Zweden: "SE",
  Zwitserland: "CH",
};

function toFlagEmoji(iso2: string) {
  const normalized = iso2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return "";
  }

  const base = 0x1f1e6;
  const chars = [...normalized].map((char) => String.fromCodePoint(base + char.charCodeAt(0) - 65));
  return chars.join("");
}

export function getCountryFlag(countryOrClub: string) {
  const iso2 = COUNTRY_TO_ISO2[countryOrClub];
  if (!iso2) {
    return "";
  }

  return toFlagEmoji(iso2);
}

export function withCountryFlag(countryOrClub: string, text: string) {
  const flag = getCountryFlag(countryOrClub);
  return flag ? `${flag} ${text}` : text;
}

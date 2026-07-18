import type { PlayerRecord } from "./player";

const REQUIRED_CANONICAL_HEADERS = ["id", "naam", "club", "positie", "prijs"] as const;

const HEADER_ALIASES: Record<string, (typeof REQUIRED_CANONICAL_HEADERS)[number]> = {
  id: "id",
  "speler id": "id",
  naam: "naam",
  "speler naam": "naam",
  club: "club",
  positie: "positie",
  prijs: "prijs",
  transferwaarde: "prijs",
};

const POSITION_ALIASES: Record<string, string> = {
  keeper: "GK",
  gk: "GK",
  verdediger: "DEF",
  def: "DEF",
  middenvelder: "MID",
  mid: "MID",
  aanvaller: "FWD",
  fwd: "FWD",
  att: "FWD",
};

function normalizePrice(prijsRaw: string): number {
  const parsed = Number(prijsRaw.replace(",", "."));

  if (Number.isNaN(parsed)) {
    throw new Error(`Ongeldige prijs: ${prijsRaw}`);
  }

  if (parsed >= 100000) {
    return parsed / 1_000_000;
  }

  return parsed;
}

function normalizePosition(input: string): string {
  const key = input.trim().toLowerCase();
  return POSITION_ALIASES[key] ?? input.trim().toUpperCase();
}

export function parsePlayerCsv(csvContent: string): { players: PlayerRecord[] } {
  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV bevat geen dataregels.");
  }

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const rawHeaders = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());

  const canonicalHeaders = rawHeaders.map((raw) => HEADER_ALIASES[raw] ?? raw);

  for (const required of REQUIRED_CANONICAL_HEADERS) {
    if (!canonicalHeaders.includes(required)) {
      throw new Error(`Verplichte kolom ontbreekt: ${required}`);
    }
  }

  const columnIndex = Object.fromEntries(canonicalHeaders.map((header, index) => [header, index]));

  const players: PlayerRecord[] = lines.slice(1).map((line, rowIdx) => {
    const cols = line.split(delimiter).map((c) => c.trim());

    const prijsRaw = cols[columnIndex.prijs] ?? "";

    let prijs: number;
    try {
      prijs = normalizePrice(prijsRaw);
    } catch {
      throw new Error(`Ongeldige prijs op regel ${rowIdx + 2}: ${prijsRaw}`);
    }

    return {
      id: cols[columnIndex.id],
      naam: cols[columnIndex.naam],
      club: cols[columnIndex.club],
      positie: normalizePosition(cols[columnIndex.positie] ?? ""),
      prijs,
    };
  });

  return { players };
}

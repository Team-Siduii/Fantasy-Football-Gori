import { buildFormationSlots } from "./formation";

export function buildPitchRows<T>(formation: string, lineup: T[]): T[][] {
  const rows = buildFormationSlots(formation);
  let cursor = 0;

  return rows.map((row) => {
    const cards = row
      .map((_, offset) => lineup[cursor + offset])
      .filter((player): player is T => Boolean(player));

    cursor += row.length;
    return cards;
  });
}

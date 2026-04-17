type Position = "GK" | "DEF" | "MID" | "FWD";

type FormationConfig = {
  label: string;
  defenders: number;
  midfielders: number;
  forwards: number;
};

const FORMATIONS: FormationConfig[] = [
  { label: "4-3-3", defenders: 4, midfielders: 3, forwards: 3 },
  { label: "4-4-2", defenders: 4, midfielders: 4, forwards: 2 },
  { label: "3-5-2", defenders: 3, midfielders: 5, forwards: 2 },
  { label: "5-3-2", defenders: 5, midfielders: 3, forwards: 2 },
];

export function getFormationOptions(): string[] {
  return FORMATIONS.map((formation) => formation.label);
}

export function buildFormationSlots(formation: string): Position[][] {
  const selected = FORMATIONS.find((option) => option.label === formation) ?? FORMATIONS[0];

  return [
    ["GK"],
    Array.from({ length: selected.defenders }, () => "DEF"),
    Array.from({ length: selected.midfielders }, () => "MID"),
    Array.from({ length: selected.forwards }, () => "FWD"),
  ];
}

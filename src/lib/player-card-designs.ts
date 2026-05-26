export type PlayerCardDesignConcept = {
  id: "modern-minimal" | "dark-data" | "panini-classic" | "dynamic-action";
  title: string;
  tagline: string;
  recommended?: boolean;
};

const DESIGN_CONCEPTS: PlayerCardDesignConcept[] = [
  {
    id: "modern-minimal",
    title: "Modern & Minimalistisch",
    tagline: "Strak, premium en direct inzetbaar in de huidige UI.",
    recommended: true,
  },
  {
    id: "dark-data",
    title: "Dark Mode Data",
    tagline: "Stoer e-sports gevoel met neon hiërarchie.",
  },
  {
    id: "panini-classic",
    title: "Klassieke Panini-stijl",
    tagline: "Nostalgische kaartlook met premium foil-balk.",
  },
  {
    id: "dynamic-action",
    title: "Dynamisch Actie Design",
    tagline: "Schuine vormen en snelheid zoals op matchday-posters.",
  },
];

export function getPlayerCardDesignConcepts(): PlayerCardDesignConcept[] {
  return DESIGN_CONCEPTS;
}

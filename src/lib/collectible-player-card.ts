export type CollectiblePlayerCardData = {
  name: string;
  country: string;
  valueLabel: string;
  points: number;
  flagAsset: string;
  shirtAsset: string;
  badgeAsset: string;
};

const EXAMPLES: Record<string, CollectiblePlayerCardData> = {
  france: {
    name: "KYLIAN MBAPPÉ",
    country: "Frankrijk",
    valueLabel: "€9.0M",
    points: 14,
    flagAsset: "/assets/cards/france-flag.svg",
    shirtAsset: "/assets/cards/france-shirt.svg",
    badgeAsset: "/assets/cards/gold-shield.svg",
  },
};

export function getCollectibleCardExample(key: keyof typeof EXAMPLES): CollectiblePlayerCardData {
  return EXAMPLES[key];
}

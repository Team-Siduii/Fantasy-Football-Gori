import Image from "next/image";
import type { CSSProperties } from "react";
import type { CollectiblePlayerCardData } from "@/lib/collectible-player-card";
import styles from "./collectible-player-card.module.css";

type Props = {
  card: CollectiblePlayerCardData;
  className?: string;
};

export function CollectiblePlayerCard({ card, className }: Props) {
  const style = {
    "--card-flag-image": `url('${card.flagAsset}')`,
  } as CSSProperties;

  return (
    <article className={`${styles.card} ${className ?? ""}`.trim()} style={style} aria-label={`Spelerskaart ${card.name}`}>
      <div className={styles.badgeWrap}>
        <Image src={card.badgeAsset} alt="Punten badge" className={styles.badgeAsset} width={52} height={62} />
        <span className={styles.badgeText}>{card.points}</span>
      </div>

      <div className={styles.shirtWrap}>
        <Image src={card.shirtAsset} alt={`${card.country} shirt`} className={styles.shirtAsset} width={120} height={142} />
      </div>

      <footer className={styles.footer}>
        <h3>{card.name}</h3>
        <div className={styles.divider} />
        <p>{card.valueLabel}</p>
      </footer>
    </article>
  );
}

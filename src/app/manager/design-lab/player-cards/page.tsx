import { getPlayerCardDesignConcepts } from "@/lib/player-card-designs";
import styles from "./player-cards-lab.module.css";

const samplePlayer = {
  name: "Cristiano Ronaldo",
  position: "Aanvaller",
  flag: "🇵🇹",
  points: "+8",
  price: "€ 14.50M",
};

const collectorCards = [
  { name: "KYLIAN MBAPPÉ", flag: "🇫🇷", rating: 14, price: "€9.0M", jersey: "FFF" },
  { name: "VIRGIL VAN DIJK", flag: "🇳🇱", rating: 13, price: "€8.5M", jersey: "KNVB" },
  { name: "CRISTIANO RONALDO", flag: "🇵🇹", rating: 14, price: "€9.2M", jersey: "FPF" },
  { name: "LUKA MODRIĆ", flag: "🇭🇷", rating: 12, price: "€7.8M", jersey: "HNS" },
];

export default function PlayerCardsDesignLabPage() {
  const concepts = getPlayerCardDesignConcepts();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Spelerskaarten Design Lab</h1>
        <p>Tijdelijke pagina om 4 nieuwe kaartstijlen side-by-side te vergelijken.</p>
      </header>

      <section className={styles.grid}>
        {concepts.map((concept) => (
          <article key={concept.id} className={styles.variantBlock}>
            <div className={styles.variantHead}>
              <h2>{concept.title}</h2>
              {concept.recommended ? <span className={styles.badge}>Aanbevolen</span> : null}
            </div>
            <p className={styles.tagline}>{concept.tagline}</p>

            {concept.id === "modern-minimal" ? (
              <div className={`${styles.card} ${styles.modern}`}>
                <div className={styles.pointsBubble}>{samplePlayer.points} pt</div>
                <div className={styles.avatar}>👤</div>
                <div className={styles.body}>
                  <div className={styles.nameRow}>
                    <span>{samplePlayer.flag}</span>
                    <strong>{samplePlayer.name}</strong>
                  </div>
                  <small>{samplePlayer.position}</small>
                  <div className={styles.pricePill}>{samplePlayer.price}</div>
                </div>
              </div>
            ) : null}

            {concept.id === "dark-data" ? (
              <div className={`${styles.card} ${styles.dark}`}>
                <div className={styles.watermark}>{samplePlayer.flag}</div>
                <div className={styles.darkBody}>
                  <small>{samplePlayer.position}</small>
                  <strong>{samplePlayer.name}</strong>
                  <p className={styles.neonPoints}>{samplePlayer.points} PT</p>
                </div>
                <div className={styles.darkPrice}>{samplePlayer.price}</div>
              </div>
            ) : null}

            {concept.id === "panini-classic" ? (
              <div className={`${styles.card} ${styles.panini}`}>
                <div className={styles.paniniFlag}>{samplePlayer.flag}</div>
                <div className={styles.paniniPhoto}>⚽</div>
                <div className={styles.paniniBar}>
                  <span>{samplePlayer.price}</span>
                  <strong>{samplePlayer.points} PT</strong>
                </div>
              </div>
            ) : null}

            {concept.id === "dynamic-action" ? (
              <div className={`${styles.card} ${styles.dynamic}`}>
                <div className={styles.dynamicPoints}>{samplePlayer.points} PT</div>
                <div className={styles.dynamicBody}>
                  <small>{samplePlayer.position}</small>
                  <strong>{samplePlayer.name}</strong>
                </div>
                <div className={styles.dynamicPrice}>{samplePlayer.price}</div>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      <section className={styles.referenceSection}>
        <div className={styles.referenceHead}>
          <h2>Referentie-stijl: Collectible National Card</h2>
          <p>
            Geïnspireerd op je voorbeeld: premium frame, vlag-achtergrond, goud schild, shirt-focus en klassieke
            naam/prijsbalk.
          </p>
        </div>

        <div className={styles.referenceGrid}>
          {collectorCards.map((player) => (
            <article key={player.name} className={styles.collectorCard}>
              <div className={styles.collectorInner}>
                <div className={styles.collectorMiniFlag}>{player.flag}</div>
                <div className={styles.collectorBadge}>{player.rating}</div>

                <div className={styles.collectorShirtWrap}>
                  <div className={styles.collectorShirt}>
                    <span>★</span>
                    <small>{player.jersey}</small>
                  </div>
                </div>

                <div className={styles.collectorFooter}>
                  <h3>{player.name}</h3>
                  <div className={styles.collectorDivider}>✦</div>
                  <p>{player.price}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

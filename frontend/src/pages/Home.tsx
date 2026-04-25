import { Link } from 'react-router-dom';
import styles from './Home.module.css';

export default function Home() {
  return (
    <main className={styles.hero}>
      <div className={styles.content}>
        <div className={styles.logo}>⚔️</div>
        <h1 className={styles.title}>MTG Commander</h1>
        <h2 className={styles.subtitle}>Deck Creator</h2>
        <p className={styles.desc}>
          Costruisci, gestisci e analizza i tuoi mazzi Commander di Magic: The Gathering.
          Ricerca carte via Scryfall, visualizza statistiche e valida il tuo mazzo in tempo reale.
        </p>
        <div className={styles.actions}>
          <Link to="/decks/new" className={styles.btnPrimary}>
            Crea nuovo mazzo
          </Link>
          <Link to="/decks" className={styles.btnSecondary}>
            I miei mazzi
          </Link>
        </div>
      </div>
      <div className={styles.cards}>
        {PREVIEW_COLORS.map((color, i) => (
          <div key={i} className={styles.previewCard} style={{ '--hue': color } as React.CSSProperties} />
        ))}
      </div>
    </main>
  );
}

const PREVIEW_COLORS = ['220', '0', '270', '160', '40'];


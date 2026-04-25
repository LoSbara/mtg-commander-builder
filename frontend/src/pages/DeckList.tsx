import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDeckStore } from '../store/deckStore';
import type { Deck } from 'shared';
import styles from './DeckList.module.css';

export default function DeckList() {
  const { decks, loading, error, fetchDecks, deleteDeck } = useDeckStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDecks();
  }, [fetchDecks]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Eliminare questo mazzo?')) return;
    await deleteDeck(id);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>I miei mazzi</h1>
          <p className={styles.subtitle}>{decks.length} mazzo{decks.length !== 1 ? 'i' : ''} salvato{decks.length !== 1 ? 'i' : ''}</p>
        </div>
        <Link to="/decks/new" className={styles.btnNew}>+ Nuovo mazzo</Link>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {loading && <div className={styles.loading}>Caricamento mazzi…</div>}

      {!loading && decks.length === 0 && (
        <div className={styles.empty}>
          <p>Non hai ancora nessun mazzo.</p>
          <Link to="/decks/new" className={styles.btnNew}>Crea il primo!</Link>
        </div>
      )}

      <div className={styles.grid}>
        {decks.map((deck) => (
          <DeckCard
            key={deck.id}
            deck={deck}
            onOpen={() => navigate(`/decks/${deck.id}`)}
            onDelete={(e) => handleDelete(e, deck.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DeckCard({
  deck,
  onOpen,
  onDelete,
}: {
  deck: Deck;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const cardCount = deck.cards.reduce((s, c) => s + c.quantity, 0);
  const date = new Date(deck.updated_at).toLocaleDateString('it-IT');

  return (
    <div className={styles.deckCard} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className={styles.deckTop} />
      <div className={styles.deckBody}>
        <h3 className={styles.deckName}>{deck.name}</h3>
        {deck.description && <p className={styles.deckDesc}>{deck.description}</p>}
        <div className={styles.deckMeta}>
          <span>{cardCount} / 100 carte</span>
          <span>{date}</span>
        </div>
      </div>
      <button className={styles.deleteBtn} onClick={onDelete} aria-label="Elimina mazzo">🗑</button>
    </div>
  );
}


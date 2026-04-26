import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDeckStore } from '../store/deckStore';
import type { Card, Deck } from 'shared';
import * as api from '../api';
import { ColorIdentity } from '../components/ManaSymbol/ManaSymbol';
import styles from './DeckList.module.css';

export default function DeckList() {
  const { decks, loading, error, fetchDecks, deleteDeck } = useDeckStore();
  const navigate = useNavigate();
  const [commanderCache, setCommanderCache] = useState<Map<string, Card>>(new Map());

  useEffect(() => {
    fetchDecks();
  }, [fetchDecks]);

  // Carica le carte commander per tutti i mazzi
  useEffect(() => {
    const ids = [...new Set(decks.map((d) => d.commander_id).filter(Boolean))];
    const missing = ids.filter((id) => !commanderCache.has(id));
    if (missing.length === 0) return;
    Promise.all(
      missing.map((id) =>
        api.getCard(id).then(({ data }) => [id, data] as [string, Card]).catch(() => null)
      )
    ).then((results) => {
      setCommanderCache((prev) => {
        const next = new Map(prev);
        for (const r of results) if (r) next.set(r[0], r[1]);
        return next;
      });
    });
  }, [decks]); // eslint-disable-line react-hooks/exhaustive-deps

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
            commanderCard={commanderCache.get(deck.commander_id)}
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
  commanderCard,
  onOpen,
  onDelete,
}: {
  deck: Deck;
  commanderCard?: Card;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const cardCount = (deck.cards ?? []).reduce((s, c) => s + c.quantity, 0);
  const date = new Date(deck.updated_at).toLocaleDateString('it-IT');
  const artUrl = commanderCard?.image_uris?.art_crop
    ?? commanderCard?.card_faces?.[0]?.image_uris?.art_crop;
  const colorIdentity = commanderCard?.color_identity ?? [];
  const isShared = !!(deck as { share_token?: string | null }).share_token;

  return (
    <div className={styles.deckCard} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}>

      {/* Hero art */}
      <div className={styles.deckHero}>
        {artUrl ? (
          <img className={styles.deckHeroImg} src={artUrl} alt={commanderCard?.name} loading="lazy" />
        ) : (
          <div className={styles.deckHeroFallback} />
        )}
        <div className={styles.deckHeroOverlay} />
        {colorIdentity.length > 0 && (
          <div className={styles.colorRow}>
            <ColorIdentity colors={colorIdentity} size="sm" />
          </div>
        )}
        {isShared && <span className={styles.sharedBadge}>🔗</span>}
      </div>

      <div className={styles.deckBody}>
        <h3 className={styles.deckName}>{deck.name}</h3>
        {deck.description && <p className={styles.deckDesc}>{deck.description}</p>}
        {commanderCard && (
          <p className={styles.commanderName}>{commanderCard.name}</p>
        )}
        <div className={styles.deckMeta}>
          <span className={cardCount >= 100 ? styles.metaFull : ''}>{cardCount} / 100 carte</span>
          <span>{date}</span>
        </div>
      </div>

      <button className={styles.deleteBtn} onClick={onDelete} aria-label="Elimina mazzo">🗑</button>
    </div>
  );
}


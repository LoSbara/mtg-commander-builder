import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as api from '../api';
import type { Card, Deck } from 'shared';
import styles from './ShareDeck.module.css';

export default function ShareDeck() {
  const { token } = useParams<{ token: string }>();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cardCache, setCardCache] = useState<Map<string, Card>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api
      .getPublicDeck(token)
      .then(async ({ data }) => {
        setDeck(data);
        // Hydrate all card IDs
        const allIds = [
          data.commander_id,
          ...(data.cards ?? []).map((r) => r.card_id),
          ...(data.maybeboard ?? []).map((r) => r.card_id),
        ].filter(Boolean);
        const uniqueIds = [...new Set(allIds)];
        const cache = new Map<string, Card>();
        await Promise.all(
          uniqueIds.map((id) =>
            api
              .getCard(id)
              .then(({ data: card }) => cache.set(id, card))
              .catch(() => null),
          ),
        );
        setCardCache(cache);
      })
      .catch(() => setError('Mazzo non trovato o link non più valido.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className={styles.center}>⏳ Caricamento mazzo…</div>;
  if (error) return (
    <div className={styles.center}>
      <p className={styles.errorMsg}>{error}</p>
      <Link to="/" className={styles.backLink}>← Torna alla home</Link>
    </div>
  );
  if (!deck) return null;

  const commanderCard = cardCache.get(deck.commander_id);

  // Group cards by type
  const grouped: Record<string, typeof deck.cards> = {};
  for (const row of deck.cards ?? []) {
    const card = cardCache.get(row.card_id);
    const type = card?.type_line?.split('—')[0].trim().split(' ').pop() ?? 'Altro';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(row);
  }
  const typeOrder = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Altro'];
  const sortedTypes = [
    ...typeOrder.filter((t) => grouped[t]),
    ...Object.keys(grouped).filter((t) => !typeOrder.includes(t)),
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backLink}>← MTG Deck Creator</Link>
        <h1 className={styles.title}>{deck.name}</h1>
        {deck.description && <p className={styles.desc}>{deck.description}</p>}
      </header>

      <div className={styles.layout}>
        {/* Commander */}
        <aside className={styles.sidebar}>
          {commanderCard && (
            <div className={styles.commanderSection}>
              <p className={styles.sectionLabel}>Commander</p>
              {commanderCard.image_uris?.normal && (
                <img
                  className={styles.commanderImg}
                  src={commanderCard.image_uris.normal}
                  alt={commanderCard.name}
                />
              )}
              <p className={styles.commanderName}>{commanderCard.name}</p>
            </div>
          )}
        </aside>

        {/* Card list */}
        <main className={styles.main}>
          <p className={styles.cardCount}>{(deck.cards ?? []).length} carte</p>
          {sortedTypes.map((type) => (
            <div key={type} className={styles.typeGroup}>
              <h3 className={styles.typeTitle}>
                {type} <span className={styles.typeCount}>({grouped[type].length})</span>
              </h3>
              <ul className={styles.cardList}>
                {grouped[type].map((row) => {
                  const card = cardCache.get(row.card_id);
                  return (
                    <li key={row.card_id} className={styles.cardItem}>
                      <span className={styles.qty}>{row.quantity}x</span>
                      <span className={styles.cardName}>{card?.name ?? row.card_id}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {(deck.maybeboard ?? []).length > 0 && (
            <div className={styles.typeGroup}>
              <h3 className={styles.typeTitle}>
                Maybeboard <span className={styles.typeCount}>({deck.maybeboard!.length})</span>
              </h3>
              <ul className={styles.cardList}>
                {deck.maybeboard!.map((row) => {
                  const card = cardCache.get(row.card_id);
                  return (
                    <li key={row.card_id} className={styles.cardItem}>
                      <span className={styles.qty}>{row.quantity}x</span>
                      <span className={styles.cardName}>{card?.name ?? row.card_id}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

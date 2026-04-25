import { useState, useEffect, useRef } from 'react';
import { useSearchStore } from '../../store/searchStore';
import { CardThumbnail } from '../Card/CardThumbnail';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import type { Card } from 'shared';
import styles from './CardSearch.module.css';

interface Props {
  onAddCard: (card: Card) => void;
  /** ID carte già nel mazzo — per disabilitare il bottone "aggiungi" */
  deckCardIds?: Set<string>;
}

export function CardSearch({ onAddCard, deckCardIds = new Set() }: Props) {
  const [input, setInput] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { results, hasMore, searching, searchError, search, searchMore, clearSearch } =
    useSearchStore();

  // Debounce la ricerca: parte 500ms dopo che l'utente smette di digitare
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!input.trim()) {
      clearSearch();
      return;
    }
    timer.current = setTimeout(() => search(input), 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [input, search, clearSearch]);

  // Infinite scroll: carica la pagina successiva quando si raggiunge il fondo
  const sentinelRef = useIntersectionObserver(searchMore, hasMore && !searching);

  return (
    <div className={styles.container}>
      <div className={styles.inputWrap}>
        <input
          className={styles.input}
          type="search"
          placeholder="Cerca carte (es. Lightning Bolt, Counterspell…)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Cerca carte"
        />
        {searching && <span className={styles.spinner} aria-label="Ricerca in corso…" />}
      </div>

      {searchError && <p className={styles.error}>{searchError}</p>}

      {results.length > 0 && (
        <div className={styles.grid}>
          {results.map((card) => (
            <CardThumbnail
              key={card.id}
              card={card}
              actionLabel="+"
              onAction={onAddCard}
              disabled={deckCardIds.has(card.id)}
            />
          ))}
          {/* Sentinel per infinite scroll */}
          <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
        </div>
      )}

      {!searching && !searchError && input.trim() && results.length === 0 && (
        <p className={styles.empty}>Nessuna carta trovata per &ldquo;{input}&rdquo;</p>
      )}
    </div>
  );
}

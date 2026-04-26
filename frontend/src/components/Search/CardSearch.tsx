import { useState, useEffect, useRef } from 'react';
import { useSearchStore } from '../../store/searchStore';
import { CardThumbnail } from '../Card/CardThumbnail';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import {
  SearchFiltersModal,
  EMPTY_ADVANCED_FILTERS,
  countActiveFilters,
  buildAdvancedQuery,
} from './SearchFiltersModal';
import type { AdvancedFilters } from './SearchFiltersModal';
import type { Card } from 'shared';
import styles from './CardSearch.module.css';

interface Props {
  onAddCard: (card: Card) => void;
  onAddToMaybeboard?: (card: Card) => void;
  deckCardIds?: Set<string>;
}

export function CardSearch({ onAddCard, onAddToMaybeboard, deckCardIds = new Set() }: Props) {
  const [input, setInput] = useState('');
  const [filters, setFilters] = useState<AdvancedFilters>(EMPTY_ADVANCED_FILTERS);
  const [showModal, setShowModal] = useState(false);
  const [scryfallMode, setScryfallMode] = useState(false);
  const [scryfallQuery, setScryfallQuery] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { results, hasMore, searching, searchError, search, searchMore, clearSearch } =
    useSearchStore();

  const activeFilterCount = countActiveFilters(filters);
  const currentQuery = scryfallMode ? scryfallQuery.trim() : buildAdvancedQuery(input, filters);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!currentQuery) { clearSearch(); return; }
    timer.current = setTimeout(() => search(currentQuery), 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [currentQuery, search, clearSearch]);

  const sentinelRef = useIntersectionObserver(searchMore, hasMore && !searching);

  return (
    <div className={styles.container}>
      {/* ── Toggle modalità ── */}
      <div className={styles.modeToggle}>
        <button
          className={`${styles.modeBtn} ${!scryfallMode ? styles.modeBtnActive : ''}`}
          onClick={() => setScryfallMode(false)}
          type="button"
        >
          Ricerca
        </button>
        <button
          className={`${styles.modeBtn} ${scryfallMode ? styles.modeBtnActive : ''}`}
          onClick={() => setScryfallMode(true)}
          type="button"
        >
          Sintassi Scryfall
        </button>
      </div>

      {scryfallMode ? (
        /* ── Modalità Scryfall ── */
        <div className={styles.scryfallWrap}>
          <div className={styles.inputWrap}>
            <input
              className={`${styles.input} ${styles.scryfallInput}`}
              type="search"
              placeholder="es. t:creature id>=rg pow>=4  |  oracle:draw  |  is:commander"
              value={scryfallQuery}
              onChange={(e) => setScryfallQuery(e.target.value)}
              aria-label="Ricerca sintassi Scryfall"
              spellCheck={false}
            />
            {searching && <span className={styles.spinner} aria-label="Ricerca in corso…" />}
          </div>
          <p className={styles.scryfallHint}>
            Sintassi Scryfall completa: <code>t:</code> <code>id:</code> <code>oracle:</code> <code>cmc</code> <code>pow</code> <code>tou</code> <code>is:</code> <code>set:</code>…
          </p>
        </div>
      ) : (
        /* ── Modalità semplice + filtri modal ── */
        <div className={styles.searchRow}>
          <div className={styles.inputWrap}>
            <input
              className={styles.input}
              type="search"
              placeholder="Cerca per nome…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Cerca carte"
            />
            {searching && <span className={styles.spinner} aria-label="Ricerca in corso…" />}
          </div>
          <button
            className={`${styles.filterBtn} ${activeFilterCount > 0 ? styles.filterBtnActive : ''}`}
            onClick={() => setShowModal(true)}
            type="button"
            title="Filtri avanzati"
          >
            ⚙
            {activeFilterCount > 0 && (
              <span className={styles.filterBadge}>{activeFilterCount}</span>
            )}
          </button>
        </div>
      )}

      {searchError && <p className={styles.error}>{searchError}</p>}

      {results.length > 0 && (
        <div className={styles.grid}>
          {results.map((card) => (
            <div key={card.id} className={styles.cardWrap}>
              <CardThumbnail
                card={card}
                actionLabel="+"
                onAction={onAddCard}
                disabled={deckCardIds.has(card.id)}
              />
              {onAddToMaybeboard && (
                <button
                  className={styles.maybeBtn}
                  onClick={() => onAddToMaybeboard(card)}
                  title="Aggiungi al Maybeboard"
                  type="button"
                >
                  📋
                </button>
              )}
            </div>
          ))}
          <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
        </div>
      )}

      {!searching && !searchError && currentQuery && results.length === 0 && (
        <p className={styles.empty}>Nessuna carta trovata</p>
      )}

      {showModal && (
        <SearchFiltersModal
          filters={filters}
          onChange={setFilters}
          onClose={() => setShowModal(false)}
          onReset={() => setFilters(EMPTY_ADVANCED_FILTERS)}
          activeCount={activeFilterCount}
        />
      )}
    </div>
  );
}

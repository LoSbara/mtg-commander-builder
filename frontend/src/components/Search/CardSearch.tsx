import { useState, useEffect, useRef } from 'react';
import { useSearchStore } from '../../store/searchStore';
import { CardThumbnail } from '../Card/CardThumbnail';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import type { Card } from 'shared';
import styles from './CardSearch.module.css';

interface SearchFilters {
  colors: string[];   // 'W' | 'U' | 'B' | 'R' | 'G' | 'C'
  type: string;       // '' | 'creature' | 'instant' | ...
  minCmc: string;
  maxCmc: string;
  rarity: string;     // '' | 'common' | 'uncommon' | 'rare' | 'mythic'
}

const EMPTY_FILTERS: SearchFilters = { colors: [], type: '', minCmc: '', maxCmc: '', rarity: '' };

interface Props {
  onAddCard: (card: Card) => void;
  onAddToMaybeboard?: (card: Card) => void;
  deckCardIds?: Set<string>;
}

function buildQuery(text: string, filters: SearchFilters): string {
  const parts: string[] = [];
  if (text.trim()) parts.push(text.trim());
  if (filters.colors.length > 0) {
    const c = filters.colors.join('');
    parts.push(`id:${c}`);
  }
  if (filters.type) parts.push(`type:${filters.type}`);
  if (filters.minCmc) parts.push(`cmc>=${filters.minCmc}`);
  if (filters.maxCmc) parts.push(`cmc<=${filters.maxCmc}`);
  if (filters.rarity) parts.push(`rarity:${filters.rarity}`);
  return parts.join(' ') || '';
}

export function CardSearch({ onAddCard, onAddToMaybeboard, deckCardIds = new Set() }: Props) {
  const [input, setInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { results, hasMore, searching, searchError, search, searchMore, clearSearch } =
    useSearchStore();

  const hasActiveFilters =
    filters.colors.length > 0 || filters.type || filters.minCmc || filters.maxCmc || filters.rarity;

  // Debounce la ricerca: parte 500ms dopo che l'utente smette di digitare
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = buildQuery(input, filters);
    if (!query) {
      clearSearch();
      return;
    }
    timer.current = setTimeout(() => search(query), 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [input, filters, search, clearSearch]);

  // Infinite scroll: carica la pagina successiva quando si raggiunge il fondo
  const sentinelRef = useIntersectionObserver(searchMore, hasMore && !searching);

  function toggleColor(c: string) {
    setFilters((f) => ({
      ...f,
      colors: f.colors.includes(c) ? f.colors.filter((x) => x !== c) : [...f.colors, c],
    }));
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
  }

  const colorLabels: [string, string, string][] = [
    ['W', '☀️', '#f9fafb'],
    ['U', '💧', '#60a5fa'],
    ['B', '💀', '#a78bfa'],
    ['R', '🔥', '#f87171'],
    ['G', '🌲', '#34d399'],
  ];

  return (
    <div className={styles.container}>
      {/* Barra di ricerca */}
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

      {/* Toggle filtri */}
      <button
        className={`${styles.filterToggle} ${hasActiveFilters ? styles.filterToggleActive : ''}`}
        onClick={() => setShowFilters((v) => !v)}
        type="button"
      >
        🔍 Filtri {hasActiveFilters && <span className={styles.filterBadge}>{[filters.colors.length > 0, !!filters.type, !!filters.minCmc || !!filters.maxCmc, !!filters.rarity].filter(Boolean).length}</span>}
        <span className={styles.filterArrow}>{showFilters ? '▲' : '▼'}</span>
      </button>

      {/* Pannello filtri */}
      {showFilters && (
        <div className={styles.filterPanel}>
          {/* Colori */}
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Colore</span>
            <div className={styles.colorBtns}>
              {colorLabels.map(([c, icon, col]) => (
                <button
                  key={c}
                  className={`${styles.colorBtn} ${filters.colors.includes(c) ? styles.colorBtnActive : ''}`}
                  style={{ '--color-btn': col } as React.CSSProperties}
                  onClick={() => toggleColor(c)}
                  title={c}
                  type="button"
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo */}
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Tipo</span>
            <select
              className={styles.filterSelect}
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="">Tutti</option>
              <option value="creature">Creature</option>
              <option value="instant">Instant</option>
              <option value="sorcery">Sorcery</option>
              <option value="enchantment">Enchantment</option>
              <option value="artifact">Artifact</option>
              <option value="planeswalker">Planeswalker</option>
              <option value="land">Land</option>
            </select>
          </div>

          {/* CMC */}
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>CMC</span>
            <div className={styles.cmcRange}>
              <input
                className={styles.filterInput}
                type="number"
                min="0"
                max="20"
                placeholder="min"
                value={filters.minCmc}
                onChange={(e) => setFilters((f) => ({ ...f, minCmc: e.target.value }))}
              />
              <span className={styles.cmcDash}>–</span>
              <input
                className={styles.filterInput}
                type="number"
                min="0"
                max="20"
                placeholder="max"
                value={filters.maxCmc}
                onChange={(e) => setFilters((f) => ({ ...f, maxCmc: e.target.value }))}
              />
            </div>
          </div>

          {/* Rarità */}
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Rarità</span>
            <select
              className={styles.filterSelect}
              value={filters.rarity}
              onChange={(e) => setFilters((f) => ({ ...f, rarity: e.target.value }))}
            >
              <option value="">Tutte</option>
              <option value="common">Common</option>
              <option value="uncommon">Uncommon</option>
              <option value="rare">Rare</option>
              <option value="mythic">Mythic</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button className={styles.resetBtn} onClick={resetFilters} type="button">
              ✕ Reset filtri
            </button>
          )}
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
          {/* Sentinel per infinite scroll */}
          <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
        </div>
      )}

      {!searching && !searchError && buildQuery(input, filters) && results.length === 0 && (
        <p className={styles.empty}>Nessuna carta trovata</p>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useSearchStore } from '../../store/searchStore';
import { CardThumbnail } from '../Card/CardThumbnail';
import { ManaIcon } from '../ManaSymbol/ManaSymbol';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import type { Card } from 'shared';
import styles from './CardSearch.module.css';

type ColorMode = 'gte' | 'exact' | 'lte';

interface SearchFilters {
  colors: string[];     // 'W' | 'U' | 'B' | 'R' | 'G' | 'C'
  colorMode: ColorMode; // >=, =, <=
  type: string;
  subtype: string;
  minCmc: string;
  maxCmc: string;
  rarity: string;
  oracle: string;       // ricerca nel testo della carta
}

const EMPTY_FILTERS: SearchFilters = {
  colors: [], colorMode: 'gte', type: '', subtype: '', minCmc: '', maxCmc: '', rarity: '', oracle: '',
};

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
    const op = filters.colorMode === 'exact' ? '=' : filters.colorMode === 'lte' ? '<=' : '>=';
    parts.push(`id${op}${c}`);
  }
  if (filters.type) parts.push(`type:${filters.type}`);
  if (filters.subtype) parts.push(`type:${filters.subtype}`);
  if (filters.minCmc) parts.push(`cmc>=${filters.minCmc}`);
  if (filters.maxCmc) parts.push(`cmc<=${filters.maxCmc}`);
  if (filters.rarity) parts.push(`rarity:${filters.rarity}`);
  if (filters.oracle) {
    const q = filters.oracle.trim();
    parts.push(`oracle:${q.includes(' ') ? `"${q}"` : q}`);
  }
  return parts.join(' ') || '';
}

export function CardSearch({ onAddCard, onAddToMaybeboard, deckCardIds = new Set() }: Props) {
  const [input, setInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [scryfallMode, setScryfallMode] = useState(false);
  const [scryfallQuery, setScryfallQuery] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { results, hasMore, searching, searchError, search, searchMore, clearSearch } =
    useSearchStore();

  const hasActiveFilters =
    filters.colors.length > 0 || !!filters.type || !!filters.subtype ||
    !!filters.minCmc || !!filters.maxCmc || !!filters.rarity || !!filters.oracle;

  const activeFilterCount = [
    filters.colors.length > 0,
    !!filters.type,
    !!filters.subtype,
    !!filters.minCmc || !!filters.maxCmc,
    !!filters.rarity,
    !!filters.oracle,
  ].filter(Boolean).length;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = scryfallMode ? scryfallQuery.trim() : buildQuery(input, filters);
    if (!query) { clearSearch(); return; }
    timer.current = setTimeout(() => search(query), 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [input, filters, scryfallMode, scryfallQuery, search, clearSearch]);

  const sentinelRef = useIntersectionObserver(searchMore, hasMore && !searching);

  function toggleColor(c: string) {
    setFilters((f) => ({
      ...f,
      colors: f.colors.includes(c) ? f.colors.filter((x) => x !== c) : [...f.colors, c],
    }));
  }

  function resetFilters() { setFilters(EMPTY_FILTERS); }

  const colorDefs: [string, string][] = [
    ['W', 'Bianco'], ['U', 'Blu'], ['B', 'Nero'], ['R', 'Rosso'], ['G', 'Verde'], ['C', 'Incolore'],
  ];

  const currentQuery = scryfallMode ? scryfallQuery.trim() : buildQuery(input, filters);

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
        /* ── Modalità semplice ── */
        <>
          <div className={styles.inputWrap}>
            <input
              className={styles.input}
              type="search"
              placeholder="Cerca per nome (es. Lightning Bolt…)"
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
            🔍 Filtri
            {hasActiveFilters && <span className={styles.filterBadge}>{activeFilterCount}</span>}
            <span className={styles.filterArrow}>{showFilters ? '▲' : '▼'}</span>
          </button>

          {showFilters && (
            <div className={styles.filterPanel}>
              {/* ── Colori ── */}
              <div className={styles.filterRow}>
                <span className={styles.filterLabel}>Colore</span>
                <div className={styles.colorBtns}>
                  {colorDefs.map(([c, label]) => (
                    <button
                      key={c}
                      className={`${styles.colorBtn} ${styles[`color${c}`] ?? ''} ${filters.colors.includes(c) ? styles.colorBtnActive : ''}`}
                      onClick={() => toggleColor(c)}
                      title={label}
                      type="button"
                    >
                      <ManaIcon symbol={c} size="sm" />
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Color match mode ── */}
              {filters.colors.length > 0 && (
                <div className={styles.filterRow}>
                  <span className={styles.filterLabel}>Match</span>
                  <div className={styles.colorModeBtns}>
                    {([['gte', '≥ Include'], ['exact', '= Esatto'], ['lte', '≤ Massimo']] as [ColorMode, string][]).map(([v, l]) => (
                      <button
                        key={v}
                        className={`${styles.colorModeBtn} ${filters.colorMode === v ? styles.colorModeBtnActive : ''}`}
                        onClick={() => setFilters((f) => ({ ...f, colorMode: v }))}
                        type="button"
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Tipo ── */}
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
                  <option value="battle">Battle</option>
                  <option value="land">Land</option>
                  <option value="kindred">Kindred</option>
                </select>
              </div>

              {/* ── Sottotipo ── */}
              <div className={styles.filterRow}>
                <span className={styles.filterLabel}>Sottotipo</span>
                <input
                  className={`${styles.filterInput} ${styles.filterInputFull}`}
                  type="text"
                  placeholder="es. Dragon, Wizard…"
                  value={filters.subtype}
                  onChange={(e) => setFilters((f) => ({ ...f, subtype: e.target.value }))}
                />
              </div>

              {/* ── CMC ── */}
              <div className={styles.filterRow}>
                <span className={styles.filterLabel}>CMC</span>
                <div className={styles.cmcRange}>
                  <input
                    className={styles.filterInput}
                    type="number" min="0" max="20" placeholder="min"
                    value={filters.minCmc}
                    onChange={(e) => setFilters((f) => ({ ...f, minCmc: e.target.value }))}
                  />
                  <span className={styles.cmcDash}>–</span>
                  <input
                    className={styles.filterInput}
                    type="number" min="0" max="20" placeholder="max"
                    value={filters.maxCmc}
                    onChange={(e) => setFilters((f) => ({ ...f, maxCmc: e.target.value }))}
                  />
                </div>
              </div>

              {/* ── Rarità ── */}
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

              {/* ── Oracle text ── */}
              <div className={styles.filterRow}>
                <span className={styles.filterLabel}>Testo</span>
                <input
                  className={`${styles.filterInput} ${styles.filterInputFull}`}
                  type="text"
                  placeholder="Cerca nel testo carta…"
                  value={filters.oracle}
                  onChange={(e) => setFilters((f) => ({ ...f, oracle: e.target.value }))}
                />
              </div>

              {hasActiveFilters && (
                <button className={styles.resetBtn} onClick={resetFilters} type="button">
                  ✕ Reset filtri
                </button>
              )}
            </div>
          )}
        </>
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
    </div>
  );
}

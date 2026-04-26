import { useEffect, useRef } from 'react';
import { ManaIcon } from '../ManaSymbol/ManaSymbol';
import styles from './SearchFiltersModal.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AdvancedFilters {
  colors: string[];
  colorLogic: 'or' | 'and';
  colorMode: 'identity' | 'color';
  colorMatch: 'gte' | 'exact' | 'lte';
  type: string;
  supertype: string;
  subtype: string;
  oracle: string;
  manaCost: string;
  mvOp: '=' | '>=' | '<=';
  mvValue: string;
  powOp: '=' | '>=' | '<=';
  powValue: string;
  touOp: '=' | '>=' | '<=';
  touValue: string;
  rarities: string[];
  set: string;
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFilters = {
  colors: [],
  colorLogic: 'or',
  colorMode: 'identity',
  colorMatch: 'gte',
  type: '',
  supertype: '',
  subtype: '',
  oracle: '',
  manaCost: '',
  mvOp: '>=',
  mvValue: '',
  powOp: '>=',
  powValue: '',
  touOp: '>=',
  touValue: '',
  rarities: [],
  set: '',
};

// ─── Query builder ───────────────────────────────────────────────────────────

export function buildAdvancedQuery(text: string, f: AdvancedFilters): string {
  const parts: string[] = [];
  if (text.trim()) parts.push(text.trim());

  if (f.colors.length > 0) {
    const colored = f.colors.filter((c) => c !== 'C');
    const hasColorless = f.colors.includes('C');
    const prefix = f.colorMode === 'identity' ? 'id' : 'color';
    const op = f.colorMatch === 'exact' ? '=' : f.colorMatch === 'lte' ? '<=' : '>=';

    if (f.colorLogic === 'or' && (colored.length + (hasColorless ? 1 : 0)) > 1) {
      const orTerms = [
        ...colored.map((c) => `${prefix}${op}${c}`),
        ...(hasColorless ? [`${prefix}${op}c`] : []),
      ];
      parts.push(`(${orTerms.join(' or ')})`);
    } else {
      if (colored.length > 0) parts.push(`${prefix}${op}${colored.join('')}`);
      if (hasColorless) parts.push(`${prefix}${op}c`);
    }
  }

  if (f.type) parts.push(`type:${f.type}`);
  if (f.supertype) parts.push(`type:${f.supertype}`);
  if (f.subtype) parts.push(`type:${f.subtype}`);

  if (f.oracle.trim()) {
    const q = f.oracle.trim();
    parts.push(`oracle:${q.includes(' ') ? `"${q}"` : q}`);
  }
  if (f.manaCost.trim()) parts.push(`mana:${f.manaCost.trim()}`);
  if (f.mvValue) parts.push(`cmc${f.mvOp}${f.mvValue}`);
  if (f.powValue) parts.push(`pow${f.powOp}${f.powValue}`);
  if (f.touValue) parts.push(`tou${f.touOp}${f.touValue}`);

  if (f.rarities.length === 1) {
    parts.push(`rarity:${f.rarities[0]}`);
  } else if (f.rarities.length > 1) {
    parts.push(`(${f.rarities.map((r) => `rarity:${r}`).join(' or ')})`);
  }

  if (f.set.trim()) parts.push(`set:${f.set.trim()}`);

  return parts.join(' ') || '';
}

export function countActiveFilters(f: AdvancedFilters): number {
  return [
    f.colors.length > 0,
    !!f.type,
    !!f.supertype,
    !!f.subtype,
    !!f.oracle.trim(),
    !!f.manaCost.trim(),
    !!f.mvValue,
    !!f.powValue,
    !!f.touValue,
    f.rarities.length > 0,
    !!f.set.trim(),
  ].filter(Boolean).length;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const COLOR_DEFS: [string, string][] = [
  ['W', 'Bianco'],
  ['U', 'Blu'],
  ['B', 'Nero'],
  ['R', 'Rosso'],
  ['G', 'Verde'],
  ['C', 'Incolore'],
];

const COLOR_GLOW: Record<string, string> = {
  W: 'rgba(249,224,128,0.8)',
  U: 'rgba(96,165,250,0.8)',
  B: 'rgba(167,139,250,0.8)',
  R: 'rgba(248,113,113,0.8)',
  G: 'rgba(52,211,153,0.8)',
  C: 'rgba(156,163,175,0.8)',
};

const RARITY_DEFS = [
  { value: 'common',   label: 'Common',   short: 'C', color: '#9ca3af' },
  { value: 'uncommon', label: 'Uncommon', short: 'U', color: '#a1c4fd' },
  { value: 'rare',     label: 'Rare',     short: 'R', color: '#fbbf24' },
  { value: 'mythic',   label: 'Mythic',   short: 'M', color: '#f97316' },
  { value: 'special',  label: 'Special',  short: 'S', color: '#c084fc' },
];

const TYPE_OPTIONS = [
  '', 'Artifact', 'Battle', 'Creature', 'Enchantment',
  'Instant', 'Kindred', 'Land', 'Planeswalker', 'Sorcery',
];

const SUPERTYPE_OPTIONS = [
  '', 'Basic', 'Legendary', 'Snow', 'World', 'Elite', 'Ongoing',
];

// ─── Sub-components ──────────────────────────────────────────────────────────

type Op = '=' | '>=' | '<=';

interface StatRowProps {
  label: string;
  op: Op;
  value: string;
  onOpChange: (op: Op) => void;
  onValueChange: (v: string) => void;
}

function StatRow({ label, op, value, onOpChange, onValueChange }: StatRowProps) {
  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <div className={styles.statControls}>
        <div className={styles.opBtns}>
          {(['=', '>=', '<='] as Op[]).map((o) => (
            <button
              key={o}
              type="button"
              className={`${styles.opBtn} ${op === o ? styles.opBtnActive : ''}`}
              onClick={() => onOpChange(o)}
            >
              {o}
            </button>
          ))}
        </div>
        <input
          className={styles.statInput}
          type="number"
          min="0"
          max="20"
          placeholder="—"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
        />
      </div>
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

interface Props {
  filters: AdvancedFilters;
  onChange: (f: AdvancedFilters) => void;
  onClose: () => void;
  onReset: () => void;
  activeCount: number;
}

export function SearchFiltersModal({ filters, onChange, onClose, onReset, activeCount }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Chiudi su Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Blocca scroll body
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  function set(patch: Partial<AdvancedFilters>) {
    onChange({ ...filters, ...patch });
  }

  function toggleColor(c: string) {
    const next = filters.colors.includes(c)
      ? filters.colors.filter((x) => x !== c)
      : [...filters.colors, c];
    set({ colors: next });
  }

  function toggleRarity(r: string) {
    const next = filters.rarities.includes(r)
      ? filters.rarities.filter((x) => x !== r)
      : [...filters.rarities, r];
    set({ rarities: next });
  }

  return (
    <div
      className={styles.overlay}
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Filtri avanzati">

        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerTitle}>Filtri avanzati</span>
            {activeCount > 0 && (
              <span className={styles.activeBadge}>{activeCount} attivi</span>
            )}
          </div>
          <div className={styles.headerActions}>
            {activeCount > 0 && (
              <button className={styles.btnReset} onClick={onReset} type="button">
                Reset filtri
              </button>
            )}
            <button className={styles.btnClose} onClick={onClose} type="button" aria-label="Chiudi">
              ✕
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className={styles.body}>

          {/* ── COLORE ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Colore</h3>
            <div className={styles.colorGrid}>
              {COLOR_DEFS.map(([c, label]) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.colorBtn} ${filters.colors.includes(c) ? styles.colorBtnActive : ''}`}
                  style={
                    filters.colors.includes(c)
                      ? { boxShadow: `0 0 12px ${COLOR_GLOW[c]}`, borderColor: COLOR_GLOW[c] }
                      : undefined
                  }
                  onClick={() => toggleColor(c)}
                  title={label}
                >
                  <ManaIcon symbol={c} size="md" />
                  <span className={styles.colorLabel}>{label}</span>
                </button>
              ))}
            </div>

            {filters.colors.length > 0 && (
              <div className={styles.colorOptions}>
                <div className={styles.optionGroup}>
                  <span className={styles.optionLabel}>Logica</span>
                  <div className={styles.radioGroup}>
                    {([['or', 'Or'], ['and', 'And']] as const).map(([v, l]) => (
                      <label key={v} className={styles.radioLabel}>
                        <input
                          type="radio"
                          name="colorLogic"
                          value={v}
                          checked={filters.colorLogic === v}
                          onChange={() => set({ colorLogic: v })}
                          className={styles.radio}
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>

                <div className={styles.optionGroup}>
                  <span className={styles.optionLabel}>Modalità</span>
                  <div className={styles.radioGroup}>
                    {([['identity', 'Identity'], ['color', 'Colore']] as const).map(([v, l]) => (
                      <label key={v} className={styles.radioLabel}>
                        <input
                          type="radio"
                          name="colorMode"
                          value={v}
                          checked={filters.colorMode === v}
                          onChange={() => set({ colorMode: v })}
                          className={styles.radio}
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>

                <div className={styles.optionGroup}>
                  <span className={styles.optionLabel}>Match</span>
                  <div className={styles.matchBtns}>
                    {([['gte', '≥ Include'], ['exact', '= Esatto'], ['lte', '≤ Massimo']] as const).map(
                      ([v, l]) => (
                        <button
                          key={v}
                          type="button"
                          className={`${styles.matchBtn} ${filters.colorMatch === v ? styles.matchBtnActive : ''}`}
                          onClick={() => set({ colorMatch: v })}
                        >
                          {l}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ── RARITÀ ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Rarità</h3>
            <div className={styles.rarityBtns}>
              {RARITY_DEFS.map(({ value, label, short, color }) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.rarityBtn} ${filters.rarities.includes(value) ? styles.rarityBtnActive : ''}`}
                  style={
                    filters.rarities.includes(value)
                      ? { borderColor: color, boxShadow: `0 0 8px ${color}66` }
                      : undefined
                  }
                  onClick={() => toggleRarity(value)}
                  title={label}
                >
                  <span
                    className={styles.rarityShort}
                    style={{ color: filters.rarities.includes(value) ? color : undefined }}
                  >
                    {short}
                  </span>
                  <span className={styles.rarityLabel}>{label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ── TIPO CARTA ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Tipo carta</h3>
            <div className={styles.threeCol}>
              <div className={styles.fieldWrap}>
                <label className={styles.fieldLabel}>Supertipo</label>
                <select
                  className={styles.select}
                  value={filters.supertype}
                  onChange={(e) => set({ supertype: e.target.value })}
                >
                  {SUPERTYPE_OPTIONS.map((o) => (
                    <option key={o} value={o.toLowerCase()}>
                      {o || 'Tutti'}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldWrap}>
                <label className={styles.fieldLabel}>Tipo</label>
                <select
                  className={styles.select}
                  value={filters.type}
                  onChange={(e) => set({ type: e.target.value })}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o} value={o.toLowerCase()}>
                      {o || 'Tutti'}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldWrap}>
                <label className={styles.fieldLabel}>Sottotipo</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="es. Dragon, Wizard…"
                  value={filters.subtype}
                  onChange={(e) => set({ subtype: e.target.value })}
                />
              </div>
            </div>
          </section>

          {/* ── TESTO ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Testo</h3>
            <div className={styles.twoCol}>
              <div className={styles.fieldWrap}>
                <label className={styles.fieldLabel}>Oracle Text</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Cerca nel testo della carta…"
                  value={filters.oracle}
                  onChange={(e) => set({ oracle: e.target.value })}
                />
              </div>
              <div className={styles.fieldWrap}>
                <label className={styles.fieldLabel}>Costo mana</label>
                <input
                  className={`${styles.input} ${styles.monoInput}`}
                  type="text"
                  placeholder="es. {W}{U}, {3}{B}{B}"
                  value={filters.manaCost}
                  onChange={(e) => set({ manaCost: e.target.value })}
                />
              </div>
            </div>
          </section>

          {/* ── STATISTICHE ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Statistiche</h3>
            <StatRow
              label="Valore Mana (MV)"
              op={filters.mvOp}
              value={filters.mvValue}
              onOpChange={(op) => set({ mvOp: op })}
              onValueChange={(v) => set({ mvValue: v })}
            />
            <StatRow
              label="Forza (Power)"
              op={filters.powOp}
              value={filters.powValue}
              onOpChange={(op) => set({ powOp: op })}
              onValueChange={(v) => set({ powValue: v })}
            />
            <StatRow
              label="Resistenza (Toughness)"
              op={filters.touOp}
              value={filters.touValue}
              onOpChange={(op) => set({ touOp: op })}
              onValueChange={(v) => set({ touValue: v })}
            />
          </section>

          {/* ── EDIZIONE ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Edizione</h3>
            <div className={styles.fieldWrap}>
              <label className={styles.fieldLabel}>Codice set</label>
              <input
                className={styles.input}
                type="text"
                placeholder="es. dom, one, mh3, ltr, dsk…"
                value={filters.set}
                onChange={(e) => set({ set: e.target.value })}
              />
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

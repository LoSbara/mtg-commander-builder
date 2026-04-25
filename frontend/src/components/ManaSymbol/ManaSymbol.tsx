/**
 * ManaSymbol — renderizza i simboli mana di MTG usando mana-font.
 *
 * Uso:
 *   <ManaCost cost="{3}{W}{U}" />
 *   <ManaIcon symbol="W" />        ← singolo simbolo
 *   <ColorIdentity colors={['W','U']} />
 */

import styles from './ManaSymbol.module.css';

// ─── Mappatura simbolo → classe ms-* ─────────────────────────────────────────

function symbolToClass(raw: string): string {
  const s = raw.trim().toUpperCase();

  // Ibrido (es. W/U, B/R, 2/W) e Phyrexian (es. W/P, G/P)
  if (s.includes('/')) {
    const [a, b] = s.split('/');
    if (b === 'P') return `ms ms-${a.toLowerCase()}p`;   // Phyrexian
    if (a === '2') return `ms ms-2${b.toLowerCase()}`;    // 2/colore ibrido
    return `ms ms-${a.toLowerCase()}${b.toLowerCase()}`;  // ibrido bicolore
  }

  // Simboli generici letterali
  switch (s) {
    // Mana colorato
    case 'W': return 'ms ms-w';
    case 'U': return 'ms ms-u';
    case 'B': return 'ms ms-b';
    case 'R': return 'ms ms-r';
    case 'G': return 'ms ms-g';
    // Speciali
    case 'C': return 'ms ms-c';   // Incolore
    case 'S': return 'ms ms-s';   // Snow
    case 'E': return 'ms ms-e';   // Energy
    case 'T': return 'ms ms-tap'; // Tap
    case 'Q': return 'ms ms-untap'; // Untap
    case 'X': return 'ms ms-x';
    case 'Y': return 'ms ms-y';
    case 'Z': return 'ms ms-z';
    // Numerici 0-20
    default:
      if (/^\d+$/.test(s)) return `ms ms-${s}`;
      return 'ms ms-c'; // fallback
  }
}

// ─── Componenti ──────────────────────────────────────────────────────────────

interface ManaIconProps {
  /** Simbolo senza parentesi graffe, es. "W", "3", "W/U" */
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
  shadow?: boolean;
}

export function ManaIcon({ symbol, size = 'md', shadow = false }: ManaIconProps) {
  const cls = [symbolToClass(symbol), styles[size], shadow ? 'ms-shadow' : '']
    .filter(Boolean)
    .join(' ');
  return <i className={cls} aria-label={`{${symbol}}`} />;
}

interface ManaCostProps {
  /** Stringa costo mana Scryfall, es. "{3}{W}{U}" o "{W/U}{B}" */
  cost: string;
  size?: 'sm' | 'md' | 'lg';
  shadow?: boolean;
}

/**
 * Parsa una stringa costo mana Scryfall e renderizza le icone in sequenza.
 */
export function ManaCost({ cost, size = 'md', shadow = false }: ManaCostProps) {
  const tokens = cost.match(/\{([^}]+)\}/g) ?? [];
  if (tokens.length === 0) return null;
  return (
    <span className={styles.manaCost} aria-label={cost}>
      {tokens.map((tok, i) => {
        const sym = tok.slice(1, -1); // rimuovi { e }
        return <ManaIcon key={i} symbol={sym} size={size} shadow={shadow} />;
      })}
    </span>
  );
}

interface ColorIdentityProps {
  /** Array di colori, es. ['W', 'U'] */
  colors: string[];
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Mostra la color identity del commander come icone mana.
 */
export function ColorIdentity({ colors, size = 'md' }: ColorIdentityProps) {
  if (colors.length === 0) {
    return <ManaIcon symbol="C" size={size} />;
  }
  return (
    <span className={styles.manaCost} aria-label={colors.join('')}>
      {colors.map((c) => (
        <ManaIcon key={c} symbol={c} size={size} />
      ))}
    </span>
  );
}

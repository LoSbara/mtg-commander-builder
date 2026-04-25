import type { Card } from 'shared';
import styles from './CardThumbnail.module.css';

interface Props {
  card: Card;
  onClick?: (card: Card) => void;
  actionLabel?: string;
  onAction?: (card: Card) => void;
  disabled?: boolean;
}

function getCardImage(card: Card): string | null {
  if (card.image_uris?.normal) return card.image_uris.normal;
  // Double-faced: usa il fronte
  if (card.card_faces?.[0]?.image_uris?.normal) return card.card_faces[0].image_uris.normal;
  return null;
}

function getCardManaCost(card: Card): string {
  if (card.mana_cost) return card.mana_cost;
  if (card.card_faces?.[0]?.mana_cost) return card.card_faces[0].mana_cost;
  return '';
}

const COLOR_MAP: Record<string, string> = {
  W: '#f9fafb',
  U: '#3b82f6',
  B: '#1f2937',
  R: '#ef4444',
  G: '#22c55e',
};

export function CardThumbnail({ card, onClick, actionLabel, onAction, disabled }: Props) {
  const img = getCardImage(card);
  const manaCost = getCardManaCost(card);
  const colorDots = card.color_identity.slice(0, 5);

  return (
    <div
      className={styles.card}
      onClick={() => onClick?.(card)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(card)}
    >
      {img ? (
        <img className={styles.image} src={img} alt={card.name} loading="lazy" />
      ) : (
        <div className={styles.imagePlaceholder}>
          <span>{card.name}</span>
        </div>
      )}

      <div className={styles.info}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{card.name}</span>
          <span className={styles.mana}>{manaCost.replace(/[{}]/g, '')}</span>
        </div>
        <div className={styles.typeLine}>{card.type_line}</div>
        <div className={styles.footer}>
          <div className={styles.colors}>
            {colorDots.map((c) => (
              <span
                key={c}
                className={styles.colorDot}
                style={{ background: COLOR_MAP[c] ?? '#888' }}
                title={c}
              />
            ))}
          </div>
          <span className={`${styles.rarity} ${styles[card.rarity]}`}>{card.rarity[0].toUpperCase()}</span>
        </div>
      </div>

      {onAction && (
        <button
          className={styles.actionBtn}
          onClick={(e) => { e.stopPropagation(); onAction(card); }}
          disabled={disabled}
          aria-label={actionLabel ?? 'Azione'}
        >
          {actionLabel ?? '+'}
        </button>
      )}
    </div>
  );
}

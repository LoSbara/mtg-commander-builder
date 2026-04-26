import { useState, useCallback } from 'react';
import type { DeckCardRow, Card } from 'shared';
import styles from './HandSimulator.module.css';

interface Props {
  cards: DeckCardRow[];
  cardCache: Map<string, Card>;
  onClose: () => void;
}

function buildPool(cards: DeckCardRow[], cardCache: Map<string, Card>): Card[] {
  const pool: Card[] = [];
  for (const row of cards) {
    const card = cardCache.get(row.card_id);
    if (!card) continue;
    for (let i = 0; i < row.quantity; i++) {
      pool.push(card);
    }
  }
  return pool;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawN(pool: Card[], n: number): Card[] {
  return shuffle(pool).slice(0, n);
}

export function HandSimulator({ cards, cardCache, onClose }: Props) {
  const pool = buildPool(cards, cardCache);
  const [handSize, setHandSize] = useState(7);
  const [hand, setHand] = useState<Card[]>(() => drawN(pool, 7));
  const [flipped, setFlipped] = useState<Set<number>>(new Set());

  const redraw = useCallback((size: number) => {
    setHand(drawN(pool, size));
    setFlipped(new Set());
  }, [pool]);

  function handleRedraw() {
    setHandSize(7);
    redraw(7);
  }

  function handleMulligan() {
    const newSize = Math.max(0, handSize - 1);
    setHandSize(newSize);
    redraw(newSize);
  }

  function toggleFlip(idx: number) {
    setFlipped((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  const landCount = hand.filter((c) => c.type_line.toLowerCase().includes('land')).length;

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>🃏 Mano iniziale</h3>
            <span className={styles.subtitle}>
              {hand.length} carte · {landCount} terre · {hand.length - landCount} non-terre
            </span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.hand}>
          {hand.map((card, i) => {
            const img = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal;
            const isFlipped = flipped.has(i);
            return (
              <div
                key={i}
                className={`${styles.cardWrapper} ${isFlipped ? styles.dimmed : ''}`}
                onClick={() => toggleFlip(i)}
                title="Clicca per evidenziare/nascondere"
              >
                {img
                  ? <img className={styles.cardImg} src={img} alt={card.name} />
                  : <div className={styles.cardPlaceholder}>{card.name}</div>
                }
              </div>
            );
          })}
          {hand.length === 0 && (
            <p className={styles.emptyHand}>Nessuna carta (Paris mulligan a 0)</p>
          )}
        </div>

        <div className={styles.actions}>
          <button className={styles.btnRedraw} onClick={handleRedraw}>
            🔀 Nuova mano (7)
          </button>
          <button
            className={styles.btnMulligan}
            onClick={handleMulligan}
            disabled={handSize === 0}
          >
            ↩ Mulligan → {Math.max(0, handSize - 1)} carte
          </button>
        </div>
      </div>
    </div>
  );
}

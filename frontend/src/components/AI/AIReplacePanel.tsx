import { useState, useEffect } from 'react';
import type { Card } from 'shared';
import * as api from '../../api';
import type { CardReplacementResult } from '../../api';
import styles from './AIReplacePanel.module.css';
import { ManaCost } from '../ManaSymbol/ManaSymbol';

interface Props {
  deckId: string;
  cardId: string;
  cardName: string;
  commanderColors: string[];
  onAccept: (newCard: Card, oldCardId: string) => void;
  onClose: () => void;
}

export function AIReplacePanel({ deckId, cardId, cardName, onAccept, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CardReplacementResult | null>(null);
  const [tooltip, setTooltip] = useState<{ imgUrl: string; x: number; y: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .getAICardReplacement(deckId, cardId)
      .then(({ data }) => setResult(data))
      .catch((err) => setError(api.extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [deckId, cardId]);

  function handleMouseEnter(e: React.MouseEvent, card: Card | null) {
    const imgUrl = card?.image_uris?.normal ?? card?.card_faces?.[0]?.image_uris?.normal;
    if (!imgUrl) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ imgUrl, x: rect.right + 8, y: rect.top - 20 });
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>🔄 Sostituisci carta</h3>
            <p className={styles.subtitle}>Sostituzione AI per: <strong>{cardName}</strong></p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Chiudi">×</button>
        </div>

        {/* Contenuto */}
        {loading && (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <p>Analisi in corso…</p>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            <p>⚠️ {error}</p>
          </div>
        )}

        {result && !loading && (
          <div className={styles.alternatives}>
            {result.alternatives.map((alt, i) => (
              <div
                key={i}
                className={styles.altCard}
                onMouseEnter={(e) => handleMouseEnter(e, alt.card)}
                onMouseLeave={() => setTooltip(null)}
              >
                <div className={styles.altInfo}>
                  <div className={styles.altNameRow}>
                    <span className={styles.altName}>{alt.name}</span>
                    {alt.card?.mana_cost && <ManaCost cost={alt.card.mana_cost} size="sm" />}
                  </div>
                  <p className={styles.altReason}>{alt.reason}</p>
                  <div className={styles.altMeta}>
                    {alt.categories.map((c) => (
                      <span key={c} className={styles.catBadge}>{c}</span>
                    ))}
                    <span className={`${styles.bracketBadge} ${styles[`b${alt.bracket}`]}`}>
                      B{alt.bracket}
                    </span>
                    {alt.isGameChanger && (
                      <span className={styles.gcBadge}>⚡ GC</span>
                    )}
                  </div>
                </div>
                <button
                  className={styles.acceptBtn}
                  onClick={() => alt.card && onAccept(alt.card, cardId)}
                  disabled={!alt.card}
                  title={alt.card ? 'Usa questa carta (rimuovi vecchia)' : 'Carta non trovata su Scryfall'}
                >
                  ✓ Usa
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tooltip immagine */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(tooltip.x, window.innerWidth - 220),
            top: Math.max(8, Math.min(tooltip.y, window.innerHeight - 320)),
            zIndex: 10001,
            pointerEvents: 'none',
          }}
        >
          <img
            src={tooltip.imgUrl}
            alt=""
            style={{ width: 200, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.9)' }}
          />
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import type { DeckCardRow, Card } from 'shared';
import styles from './DeckCardList.module.css';
import { ManaCost } from '../ManaSymbol/ManaSymbol';

interface Props {
  cards: DeckCardRow[];
  cardCache: Map<string, Card>;
  commanderId: string;
  onRemove: (cardId: string) => void;
  totalCount: number;
  onRequestReplace?: (cardId: string) => void;
  maybeboardCards?: DeckCardRow[];
  onRemoveFromMaybeboard?: (cardId: string) => void;
  onMoveToMain?: (cardId: string) => void;
}

export function DeckCardList({
  cards,
  cardCache,
  commanderId,
  onRemove,
  totalCount,
  onRequestReplace,
  maybeboardCards = [],
  onRemoveFromMaybeboard,
  onMoveToMain,
}: Props) {
  const [tooltip, setTooltip] = useState<{ imgUrl: string; x: number; y: number } | null>(null);

  if (cards.length === 0) {
    return (
      <div className={styles.empty}>
        <p>Il mazzo è vuoto.</p>
        <p>Cerca le carte a sinistra e aggiungile!</p>
      </div>
    );
  }

  // Raggruppa per tipo
  const groups = groupByType(cards, cardCache);

  function handleMouseEnter(e: React.MouseEvent, card: Card | undefined) {
    const imgUrl = card?.image_uris?.normal ?? card?.card_faces?.[0]?.image_uris?.normal;
    if (!imgUrl) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = rect.right + 8;
    const y = rect.top - 20;
    setTooltip({ imgUrl, x, y });
  }

  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.total}>{totalCount} / 100 carte</span>
          <div className={styles.bar}>
            <div
              className={styles.barFill}
              style={{ width: `${Math.min((totalCount / 100) * 100, 100)}%` }}
            />
          </div>
        </div>

        {Object.entries(groups).map(([groupName, groupCards]) =>
          groupCards.length > 0 ? (
            <section key={groupName} className={styles.group}>
              <h4 className={styles.groupTitle}>
                {groupName} <span className={styles.groupCount}>({groupCards.length})</span>
              </h4>
              <ul className={styles.list}>
                {groupCards.map((row) => {
                  const card = cardCache.get(row.card_id);
                  const isCmd = row.card_id === commanderId;
                  return (
                    <li
                      key={row.card_id}
                      className={`${styles.item} ${isCmd ? styles.commander : ''}`}
                      onMouseEnter={(e) => handleMouseEnter(e, card)}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <span className={styles.qty}>{row.quantity}×</span>
                      <span className={styles.cardName}>{card?.name ?? row.card_id}</span>
                      {card?.mana_cost && (
                        <ManaCost cost={card.mana_cost} size="sm" />
                      )}
                      {isCmd && <span className={styles.cmdBadge}>CMD</span>}
                      {!isCmd && (
                        <>
                          {onRequestReplace && (
                            <button
                              className={styles.replaceBtn}
                              onClick={() => onRequestReplace(row.card_id)}
                              aria-label={`Sostituisci ${card?.name ?? ''}`}
                              title="Suggerisci sostituzione AI"
                            >
                              🔄
                            </button>
                          )}
                          <button
                            className={styles.removeBtn}
                            onClick={() => onRemove(row.card_id)}
                            aria-label={`Rimuovi ${card?.name ?? row.card_id}`}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null
        )}
      </div>

      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(tooltip.x, window.innerWidth - 220),
            top: Math.max(8, Math.min(tooltip.y, window.innerHeight - 320)),
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          <img
            src={tooltip.imgUrl}
            alt=""
            style={{ width: 200, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.85)' }}
          />
        </div>
      )}

      {/* ─── Maybeboard ─── */}
      {maybeboardCards.length > 0 && (
        <div className={styles.maybeSection}>
          <h4 className={styles.maybeTitle}>
            📋 Maybeboard <span className={styles.maybeCount}>({maybeboardCards.length})</span>
          </h4>
          <ul className={styles.list}>
            {maybeboardCards.map((row) => {
              const card = cardCache.get(row.card_id);
              return (
                <li
                  key={row.card_id}
                  className={`${styles.item} ${styles.maybeItem}`}
                  onMouseEnter={(e) => handleMouseEnter(e, card)}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <span className={styles.qty}>{row.quantity}×</span>
                  <span className={styles.cardName}>{card?.name ?? row.card_id}</span>
                  {card?.mana_cost && <ManaCost cost={card.mana_cost} size="sm" />}
                  {onMoveToMain && (
                    <button
                      className={styles.moveBtn}
                      onClick={() => onMoveToMain(row.card_id)}
                      title="Sposta nel mazzo principale"
                    >
                      →
                    </button>
                  )}
                  {onRemoveFromMaybeboard && (
                    <button
                      className={styles.removeBtn}
                      onClick={() => onRemoveFromMaybeboard(row.card_id)}
                      aria-label={`Rimuovi ${card?.name ?? row.card_id} dal maybeboard`}
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const GROUP_ORDER = [
  'Commander',
  'Creature',
  'Istantaneo',
  'Stregoneria',
  'Incantesimo',
  'Artefatto',
  'Planeswalker',
  'Terra',
  'Altro',
] as const;

type GroupName = (typeof GROUP_ORDER)[number];

function getGroup(typeLine: string, isCommander: boolean): GroupName {
  if (isCommander) return 'Commander';
  const t = typeLine.toLowerCase();
  if (t.includes('land'))        return 'Terra';
  if (t.includes('creature'))    return 'Creature';
  if (t.includes('instant'))     return 'Istantaneo';
  if (t.includes('sorcery'))     return 'Stregoneria';
  if (t.includes('enchantment')) return 'Incantesimo';
  if (t.includes('artifact'))    return 'Artefatto';
  if (t.includes('planeswalker')) return 'Planeswalker';
  return 'Altro';
}

function groupByType(
  cards: DeckCardRow[],
  cardCache: Map<string, Card>
): Record<GroupName, DeckCardRow[]> {
  const groups: Record<GroupName, DeckCardRow[]> = {
    Commander: [], Creature: [], Istantaneo: [], Stregoneria: [],
    Incantesimo: [], Artefatto: [], Planeswalker: [], Terra: [], Altro: [],
  };

  for (const row of cards) {
    const card = cardCache.get(row.card_id);
    const typeLine = card?.type_line ?? '';
    const group = getGroup(typeLine, row.is_commander === 1);
    groups[group].push(row);
  }

  // Ordina ogni gruppo per nome carta
  for (const g of GROUP_ORDER) {
    groups[g].sort((a, b) => {
      const na = cardCache.get(a.card_id)?.name ?? '';
      const nb = cardCache.get(b.card_id)?.name ?? '';
      return na.localeCompare(nb);
    });
  }

  return groups;
}

import type { DeckCardRow, Card } from 'shared';
import styles from './DeckCardList.module.css';
import { ManaCost } from '../ManaSymbol/ManaSymbol';

interface Props {
  cards: DeckCardRow[];
  /** Mappa card_id → oggetto Card (già caricati o in cache) */
  cardCache: Map<string, Card>;
  commanderId: string;
  onRemove: (cardId: string) => void;
  totalCount: number;
}

export function DeckCardList({ cards, cardCache, commanderId, onRemove, totalCount }: Props) {
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

  return (
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
                  <li key={row.card_id} className={`${styles.item} ${isCmd ? styles.commander : ''}`}>
                    <span className={styles.qty}>{row.quantity}×</span>
                    <span className={styles.cardName}>{card?.name ?? row.card_id}</span>
                    {card?.mana_cost && (
                      <ManaCost cost={card.mana_cost} size="sm" />
                    )}
                    {isCmd && <span className={styles.cmdBadge}>CMD</span>}
                    {!isCmd && (
                      <button
                        className={styles.removeBtn}
                        onClick={() => onRemove(row.card_id)}
                        aria-label={`Rimuovi ${card?.name ?? row.card_id}`}
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null
      )}
    </div>
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

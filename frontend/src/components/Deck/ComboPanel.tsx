import { useEffect, useState } from 'react';
import * as api from '../../api';
import type { SpellbookCombo, FindCombosResult } from '../../api';
import styles from './ComboPanel.module.css';

interface Props {
  deckId: string;
}

export function ComboPanel({ deckId }: Props) {
  const [data, setData] = useState<FindCombosResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string | number>>(new Set());
  const [tab, setTab] = useState<'results' | 'potential'>('results');

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .getDeckCombos(deckId)
      .then(({ data }) => setData(data))
      .catch((err) => setError(api.extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [deckId]);

  function toggleExpand(id: string | number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) return <div className={styles.msg}>⏳ Ricerca combo in corso…</div>;
  if (error) return <div className={styles.msg}>⚠️ {error}</div>;
  if (!data) return null;

  const total = data.results.length + data.potential.length;
  if (total === 0) {
    return (
      <div className={styles.msg}>
        Nessun combo trovato per questo mazzo tramite Commander Spellbook.
      </div>
    );
  }

  const active = tab === 'results' ? data.results : data.potential;

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${tab === 'results' ? styles.tabActive : ''}`}
          onClick={() => setTab('results')}
        >
          ⚡ Nel mazzo ({data.results.length})
        </button>
        <button
          className={`${styles.tabBtn} ${tab === 'potential' ? styles.tabActive : ''}`}
          onClick={() => setTab('potential')}
        >
          🔮 Potenziali ({data.potential.length})
        </button>
      </div>

      {active.length === 0 ? (
        <p className={styles.empty}>
          {tab === 'results'
            ? 'Nessun combo completo nel mazzo.'
            : 'Nessun combo potenziale trovato.'}
        </p>
      ) : (
        <ul className={styles.list}>
          {active.map((combo) => (
            <ComboItem
              key={combo.id}
              combo={combo}
              expanded={expanded.has(combo.id)}
              onToggle={() => toggleExpand(combo.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ComboItem({
  combo,
  expanded,
  onToggle,
}: {
  combo: SpellbookCombo;
  expanded: boolean;
  onToggle: () => void;
}) {
  const produces = combo.produces?.map((p) => p.feature.name).join(', ') ?? '';
  const cardNames = combo.uses?.map((u) => u.card.name) ?? [];

  return (
    <li className={styles.item}>
      <button className={styles.itemHeader} onClick={onToggle}>
        <span className={styles.produces}>{produces || 'Combo'}</span>
        <span className={styles.cardCount}>{cardNames.length} carte</span>
        <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className={styles.detail}>
          <div className={styles.cardList}>
            {cardNames.map((name) => (
              <span key={name} className={styles.cardChip}>{name}</span>
            ))}
          </div>
          {combo.description && (
            <p className={styles.description}>{combo.description}</p>
          )}
          {combo.steps && (
            <details className={styles.steps}>
              <summary>📋 Passi</summary>
              <pre>{combo.steps}</pre>
            </details>
          )}
          <a
            className={styles.link}
            href={`https://commanderspellbook.com/combo/${combo.id}/`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Apri su Commander Spellbook ↗
          </a>
        </div>
      )}
    </li>
  );
}

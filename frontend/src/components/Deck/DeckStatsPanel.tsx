import type { DeckStats } from 'shared';
import styles from './DeckStatsPanel.module.css';

interface Props {
  stats: DeckStats | null;
  loading?: boolean;
}

const COLOR_LABEL: Record<string, string> = {
  W: '☀️ Bianco',
  U: '💧 Blu',
  B: '💀 Nero',
  R: '🔥 Rosso',
  G: '🌲 Verde',
};

const CMC_MAX = 7;

export function DeckStatsPanel({ stats, loading }: Props) {
  if (loading) return <div className={styles.loading}>Caricamento statistiche…</div>;
  if (!stats) return <div className={styles.empty}>Aggiungi carte per vedere le statistiche.</div>;

  const maxCurveVal = Math.max(1, ...Object.values(stats.manaCurve));
  const maxColorVal = Math.max(1, ...Object.values(stats.colorDistribution));

  return (
    <div className={styles.container}>
      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Curva di mana</h4>
        <div className={styles.curve}>
          {Array.from({ length: CMC_MAX + 1 }, (_, i) => {
            const key = i === CMC_MAX ? `${CMC_MAX}+` : String(i);
            const val = stats.manaCurve[i] ?? 0;
            return (
              <div key={i} className={styles.curveBar}>
                <span className={styles.curveCount}>{val > 0 ? val : ''}</span>
                <div
                  className={styles.curveFill}
                  style={{ height: `${(val / maxCurveVal) * 60}px` }}
                />
                <span className={styles.cmc}>{key}</span>
              </div>
            );
          })}
        </div>
        <p className={styles.avg}>CMC medio: <strong>{stats.averageCmc}</strong></p>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Distribuzione colori</h4>
        <div className={styles.colorBars}>
          {(Object.entries(stats.colorDistribution) as [string, number][]).map(([color, val]) => (
            <div key={color} className={styles.colorRow}>
              <span className={styles.colorLabel}>{COLOR_LABEL[color] ?? color}</span>
              <div className={styles.colorBarTrack}>
                <div
                  className={styles.colorBarFill}
                  style={{ width: `${(val / maxColorVal) * 100}%` }}
                />
              </div>
              <span className={styles.colorVal}>{val}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Tipi di carte</h4>
        <ul className={styles.typeList}>
          {(Object.entries(stats.typeDistribution) as [string, number][])
            .filter(([, v]) => v > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([type, val]) => (
              <li key={type} className={styles.typeRow}>
                <span className={styles.typeName}>{TIPO[type] ?? type}</span>
                <span className={styles.typeVal}>{val}</span>
              </li>
            ))}
        </ul>
      </section>

      {stats.estimatedPriceEur != null && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Prezzo stimato</h4>
          <p className={styles.price}>€ {stats.estimatedPriceEur.toFixed(2)}</p>
        </section>
      )}
    </div>
  );
}

const TIPO: Record<string, string> = {
  creatures: 'Creature',
  instants: 'Istantanei',
  sorceries: 'Stregonerie',
  enchantments: 'Incantesimi',
  artifacts: 'Artefatti',
  planeswalkers: 'Planeswalker',
  lands: 'Terre',
  other: 'Altro',
};

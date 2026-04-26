import type { DeckStats, ValidationResult } from 'shared';
import styles from './DeckStatsPanel.module.css';
import { ManaIcon } from '../ManaSymbol/ManaSymbol';

interface Props {
  stats: DeckStats | null;
  loading?: boolean;
  validation?: ValidationResult | null;
}

const COLOR_LABEL: Record<string, string> = {
  W: 'Bianco',
  U: 'Blu',
  B: 'Nero',
  R: 'Rosso',
  G: 'Verde',
};

const CMC_MAX = 7;

export function DeckStatsPanel({ stats, loading, validation }: Props) {
  if (loading) return <div className={styles.loading}>Caricamento statistiche…</div>;
  if (!stats) return <div className={styles.empty}>Aggiungi carte per vedere le statistiche.</div>;

  const maxCurveVal = Math.max(1, ...Object.values(stats.manaCurve));
  const maxColorVal = Math.max(1, ...Object.values(stats.colorDistribution));

  return (
    <div className={styles.container}>
      {/* Pannello validazione */}
      {validation && (
        <section className={`${styles.section} ${validation.valid ? styles.validOk : styles.validError}`}>
          <h4 className={styles.sectionTitle}>
            {validation.valid ? '✅ Mazzo valido' : `❌ Errori (${validation.errors.length})`}
          </h4>
          {!validation.valid && (
            <ul className={styles.errorList}>
              {validation.errors.map((e, i) => (
                <li key={i} className={styles.errorItem}>{e}</li>
              ))}
            </ul>
          )}
        </section>
      )}
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
              <span className={styles.colorLabel}>
                <ManaIcon symbol={color} size="md" />
                {' '}{COLOR_LABEL[color] ?? color}
              </span>
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

      {(stats.estimatedPriceEur != null || stats.estimatedPriceUsd != null) && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Prezzo stimato</h4>
          <div className={styles.priceRow}>
            {stats.estimatedPriceEur != null && (
              <span className={styles.price}>€ {stats.estimatedPriceEur.toFixed(2)}</span>
            )}
            {stats.estimatedPriceUsd != null && (
              <span className={styles.priceUsd}>$ {stats.estimatedPriceUsd.toFixed(2)}</span>
            )}
          </div>
        </section>
      )}

      {stats.functionalStats && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Categorie funzionali</h4>
          <div className={styles.funcList}>
            {FUNCTIONAL_LABELS.map(({ key, label, target, color }) => {
              const val = (stats.functionalStats as Record<string, number>)[key] ?? 0;
              const pct = Math.min((val / target) * 100, 100);
              const status = val >= target ? 'ok' : val >= target * 0.6 ? 'warn' : 'low';
              return (
                <div key={key} className={styles.funcRow}>
                  <span className={styles.funcLabel}>{label}</span>
                  <div className={styles.funcBarTrack}>
                    <div
                      className={`${styles.funcBarFill} ${styles[`func_${status}`]}`}
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <span className={`${styles.funcVal} ${styles[`func_${status}`]}`}>
                    {val}<span className={styles.funcTarget}>/{target}</span>
                  </span>
                </div>
              );
            })}
          </div>
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

const FUNCTIONAL_LABELS = [
  { key: 'ramp',       label: '⚡ Rampa',      target: 10, color: '#15803d' },
  { key: 'draw',       label: '🃏 Draw',        target: 10, color: '#1d4ed8' },
  { key: 'removal',    label: '🗡 Rimozione',   target: 10, color: '#b91c1c' },
  { key: 'boardWipe',  label: '💥 Board Wipe',  target: 3,  color: '#9333ea' },
  { key: 'counter',    label: '🛡 Counter',     target: 5,  color: '#0891b2' },
  { key: 'tutor',      label: '📚 Tutor',       target: 5,  color: '#d97706' },
  { key: 'protection', label: '🔒 Protezione',  target: 5,  color: '#64748b' },
];

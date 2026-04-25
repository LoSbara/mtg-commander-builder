import { useState, useEffect, useRef } from 'react';
import { useSearchStore } from '../../store/searchStore';
import { CardThumbnail } from '../Card/CardThumbnail';
import type { Card } from 'shared';
import styles from './CommanderSearch.module.css';

interface Props {
  onSelect: (card: Card) => void;
  selected: Card | null;
}

export function CommanderSearch({ onSelect, selected }: Props) {
  const [input, setInput] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { commanderResults, commanderSearching, searchCommanders, clearCommanderSearch } =
    useSearchStore();

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!input.trim()) {
      clearCommanderSearch();
      return;
    }
    timer.current = setTimeout(() => searchCommanders(input), 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [input, searchCommanders, clearCommanderSearch]);

  return (
    <div className={styles.container}>
      {selected ? (
        <div className={styles.selected}>
          <CardThumbnail card={selected} />
          <button className={styles.changeBtn} onClick={() => { onSelect(selected); setInput(''); clearCommanderSearch(); }}>
            Cambia
          </button>
        </div>
      ) : (
        <>
          <div className={styles.inputWrap}>
            <input
              className={styles.input}
              type="search"
              placeholder="Cerca il tuo Commander…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Cerca commander"
            />
            {commanderSearching && <span className={styles.spinner} />}
          </div>

          {commanderResults.length > 0 && (
            <div className={styles.results}>
              {commanderResults.slice(0, 20).map((card) => (
                <CardThumbnail
                  key={card.id}
                  card={card}
                  onClick={(c) => { onSelect(c); setInput(''); clearCommanderSearch(); }}
                />
              ))}
            </div>
          )}

          {!commanderSearching && input.trim() && commanderResults.length === 0 && (
            <p className={styles.empty}>Nessun commander trovato</p>
          )}
        </>
      )}
    </div>
  );
}

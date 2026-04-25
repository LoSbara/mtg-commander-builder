import { useState, useRef } from 'react';
import * as api from '../../api';
import type { ImportResult } from '../../api';
import styles from './ImportModal.module.css';

interface Props {
  deckId: string;
  onClose: () => void;
  onImported: () => void;
}

const PLACEHOLDER = `Esempio — puoi incollare formati MTGO, Arena, Moxfield o testo semplice:

1 Sol Ring
1 Command Tower
4x Mountain
1 Lightning Bolt (MH2) 112
Swords to Plowshares
`;

export function ImportModal({ deckId, onClose, onImported }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleImport() {
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.importDeck(deckId, text);
      setResult(data);
      onImported(); // ricarica il mazzo nel genitore
    } catch (err) {
      setError(api.extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleFileLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    textareaRef.current?.focus();
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>📥 Importa carte</h2>
          <button className={styles.btnClose} onClick={onClose} aria-label="Chiudi">×</button>
        </div>

        {!result ? (
          <>
            <p className={styles.hint}>
              Incolla la lista carte o carica un file <code>.txt</code>.
              Formati supportati: MTGO, Arena, Moxfield, testo semplice.
            </p>

            <label className={styles.fileLabel}>
              📂 Carica file
              <input
                type="file"
                accept=".txt,.dec,.cod"
                className={styles.fileInput}
                onChange={handleFileLoad}
              />
            </label>

            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={14}
              spellCheck={false}
            />

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.footer}>
              <button className={styles.btnCancel} onClick={onClose}>Annulla</button>
              <button
                className={styles.btnImport}
                onClick={handleImport}
                disabled={loading || !text.trim()}
              >
                {loading ? 'Importazione…' : '↓ Importa carte'}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.results}>
            <div className={styles.resultStats}>
              <div className={styles.statBox + ' ' + styles.statOk}>
                <span className={styles.statNum}>{result.imported}</span>
                <span className={styles.statLabel}>importate</span>
              </div>
              <div className={styles.statBox + ' ' + styles.statWarn}>
                <span className={styles.statNum}>{result.notFound.length}</span>
                <span className={styles.statLabel}>non trovate</span>
              </div>
              <div className={styles.statBox + ' ' + styles.statInfo}>
                <span className={styles.statNum}>{result.skipped.length}</span>
                <span className={styles.statLabel}>già presenti</span>
              </div>
              <div className={styles.statBox + ' ' + styles.statTotal}>
                <span className={styles.statNum}>{result.total}</span>
                <span className={styles.statLabel}>carte totali</span>
              </div>
            </div>

            {result.total > 100 && (
              <div className={styles.trimWarning}>
                ⚠️ Il mazzo ha <strong>{result.total} carte</strong> — supera le 100 regolamentari.
                Usa il tab <strong>✨ AI → Taglia mazzo</strong> per farsi aiutare a ridurlo.
              </div>
            )}

            {result.notFound.length > 0 && (
              <div className={styles.notFoundList}>
                <strong>Carte non trovate su Scryfall:</strong>
                <ul>
                  {result.notFound.map((n) => <li key={n}>{n}</li>)}
                </ul>
              </div>
            )}

            <button className={styles.btnImport} onClick={onClose}>Chiudi</button>
          </div>
        )}
      </div>
    </div>
  );
}

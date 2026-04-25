import { useState, useEffect } from 'react';
import type { Card } from 'shared';
import * as api from '../../api';
import type { AISuggestions, CardSuggestion, OllamaStatus } from '../../api';
import styles from './AIAssistant.module.css';

const CATEGORY_COLORS: Record<string, string> = {
  Sinergia: '#7c3aed',
  Rampa: '#15803d',
  Rimozione: '#b91c1c',
  Draw: '#1d4ed8',
  Evasione: '#0891b2',
  Protezione: '#d97706',
  Utility: '#6b7280',
  Combo: '#db2777',
};

interface Props {
  deckId: string;
  commanderCard: Card | null;
  deckCardIds: Set<string>;
  onAddCard: (card: Card) => void;
}

export function AIAssistant({ deckId, commanderCard, deckCardIds, onAddCard }: Props) {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestions | null>(null);
  const [error, setError] = useState('');
  const [addedCards, setAddedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.getAIStatus()
      .then(({ data }) => {
        setStatus(data);
        if (data.models.length > 0) {
          // Preferisce llama3 se disponibile
          const preferred = data.models.find((m) => m.includes('llama3') || m.includes('llama-3')) ?? data.models[0];
          setSelectedModel(preferred);
        }
      })
      .catch(() => setStatus({ available: false, models: [], provider: 'ollama' }))
      .finally(() => setStatusLoading(false));
  }, []);

  async function handleGenerate() {
    if (!commanderCard) return;
    setGenerating(true);
    setError('');
    setSuggestions(null);
    try {
      const { data } = await api.getAISuggestions(deckId, selectedModel || undefined);
      setSuggestions(data);
    } catch (err) {
      setError(api.extractErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  function handleAdd(suggestion: CardSuggestion) {
    if (!suggestion.card) return;
    onAddCard(suggestion.card);
    setAddedCards((prev) => new Set(prev).add(suggestion.card!.id));
  }

  if (statusLoading) {
    return <div className={styles.loading}>Verifica Ollama…</div>;
  }

  // AI non disponibile
  if (!status?.available) {
    const isGroq = status?.provider === 'groq';
    return (
      <div className={styles.unavailable}>
        <div className={styles.unavailableIcon}>{isGroq ? '⚡' : '🤖'}</div>
        <h3>{isGroq ? 'Groq non configurato' : 'Ollama non rilevato'}</h3>
        {isGroq ? (
          <>
            <p>Imposta <strong>GROQ_API_KEY</strong> nel file <code>backend/.env</code>:</p>
            <div className={styles.codeBlock}>
              <code>GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx</code>
            </div>
            <p>Chiave gratuita su <strong>console.groq.com</strong></p>
          </>
        ) : (
          <>
            <p>Per usare l'assistente AI installa Ollama ed esegui:</p>
            <div className={styles.codeBlock}>
              <code>curl -fsSL https://ollama.com/install.sh | sh</code>
              <code>ollama pull llama3.2</code>
              <code>ollama serve</code>
            </div>
          </>
        )}
        <button className={styles.btnRetry} onClick={() => {
          setStatusLoading(true);
          api.getAIStatus()
            .then(({ data }) => setStatus(data))
            .catch(() => setStatus({ available: false, models: [], provider: status?.provider ?? 'ollama' }))
            .finally(() => setStatusLoading(false));
        }}>
          Riprova
        </button>
      </div>
    );
  }

  // Nessun modello installato (solo Ollama — Groq ha sempre i modelli)
  if (status.models.length === 0 && status.provider === 'ollama') {
    return (
      <div className={styles.unavailable}>
        <div className={styles.unavailableIcon}>📦</div>
        <h3>Nessun modello installato</h3>
        <p>Scarica un modello con:</p>
        <div className={styles.codeBlock}>
          <code>ollama pull llama3.2</code>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header con selezione modello */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.providerBadge} data-provider={status.provider}>
            {status.provider === 'groq' ? '⚡ Groq' : '🤖 Ollama'}
          </span>
        </div>
        <div className={styles.headerBottom}>
          <div className={styles.modelSelector}>
            <label className={styles.modelLabel}>Modello</label>
            <select
              className={styles.modelSelect}
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={generating}
            >
              {status.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <button
            className={styles.btnGenerate}
            onClick={handleGenerate}
            disabled={generating || !commanderCard}
            title={!commanderCard ? 'Seleziona prima un commander' : ''}
          >
            {generating ? (
              <span className={styles.generating}>
                <span className={styles.spinner} />
                Analisi in corso…
              </span>
            ) : '✨ Analizza commander'}
          </button>
        </div>
      </div>

      {!commanderCard && (
        <p className={styles.noCommander}>Seleziona un commander per usare l'AI.</p>
      )}

      {generating && (
        <div className={styles.thinkingBox}>
          <p>🧠 Il modello sta analizzando <strong>{commanderCard?.name}</strong>…</p>
          <p className={styles.thinkingHint}>
            {status.provider === 'groq'
              ? 'Risposta in ~10 secondi con Groq.'
              : 'Ci vogliono 30–120 secondi la prima volta.'}
          </p>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {suggestions && (
        <div className={styles.results}>
          {/* Overview strategico */}
          <div className={styles.overviewBox}>
            <h4 className={styles.overviewTitle}>Strategia</h4>
            <p className={styles.overview}>{suggestions.overview}</p>
          </div>

          {/* Mana base */}
          <div className={styles.manaBox}>
            <h4 className={styles.sectionTitle}>
              🏔 Mana base consigliata — {suggestions.manaBase.totalLands} terre
            </h4>
            <p className={styles.manaBreakdown}>{suggestions.manaBase.breakdown}</p>
            <ul className={styles.manaList}>
              {suggestions.manaBase.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>

          {/* Curva di mana */}
          <div className={styles.curveBox}>
            <h4 className={styles.sectionTitle}>📊 Curva di mana</h4>
            <p className={styles.curveAdvice}>{suggestions.manaCurveAdvice}</p>
          </div>

          {/* Carte consigliate */}
          <div className={styles.suggestionsSection}>
            <h4 className={styles.sectionTitle}>
              🃏 Carte consigliate ({suggestions.suggestions.length})
            </h4>
            <div className={styles.suggestionList}>
              {suggestions.suggestions.map((s, i) => {
                const alreadyInDeck = s.card ? deckCardIds.has(s.card.id) : false;
                const alreadyAdded = s.card ? addedCards.has(s.card.id) : false;
                const isAdded = alreadyInDeck || alreadyAdded;
                const categoryColor = CATEGORY_COLORS[s.category] ?? '#6b7280';

                return (
                  <div key={i} className={`${styles.suggestionCard} ${isAdded ? styles.added : ''}`}>
                    <div className={styles.suggestionLeft}>
                      {s.card?.image_uris?.small ? (
                        <img
                          className={styles.cardThumb}
                          src={s.card.image_uris.small}
                          alt={s.name}
                        />
                      ) : (
                        <div className={styles.cardThumbPlaceholder}>?</div>
                      )}
                    </div>
                    <div className={styles.suggestionContent}>
                      <div className={styles.suggestionHeader}>
                        <span className={styles.cardName}>{s.name}</span>
                        <span
                          className={styles.category}
                          style={{ background: categoryColor }}
                        >
                          {s.category}
                        </span>
                      </div>
                      <p className={styles.reason}>{s.reason}</p>
                    </div>
                    <button
                      className={`${styles.btnAdd} ${isAdded ? styles.btnAdded : ''}`}
                      onClick={() => handleAdd(s)}
                      disabled={isAdded || !s.card}
                      title={!s.card ? 'Carta non trovata su Scryfall' : isAdded ? 'Già nel mazzo' : 'Aggiungi al mazzo'}
                    >
                      {isAdded ? '✓' : '+'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import type { Card } from 'shared';
import * as api from '../../api';
import type { AISuggestions, CardSuggestion, OllamaStatus, TrimSuggestions, WeaknessAnalysis } from '../../api';
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
  totalCards?: number;
  cardNameToId?: Map<string, string>;
  onRemoveCard?: (cardId: string) => void;
}

export function AIAssistant({ deckId, commanderCard, deckCardIds, onAddCard, totalCards = 0, cardNameToId, onRemoveCard }: Props) {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestions | null>(null);
  const [error, setError] = useState('');
  const [addedCards, setAddedCards] = useState<Set<string>>(new Set());
  const [aiMode, setAiMode] = useState<'suggest' | 'trim' | 'analyze'>('suggest');
  const [trimming, setTrimming] = useState(false);
  const [trimResult, setTrimResult] = useState<TrimSuggestions | null>(null);
  const [trimError, setTrimError] = useState('');
  const [removedCards, setRemovedCards] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<WeaknessAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState('');

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

  async function handleTrim() {
    setTrimming(true);
    setTrimError('');
    setTrimResult(null);
    try {
      const { data } = await api.getAITrimSuggestions(deckId, selectedModel || undefined);
      setTrimResult(data);
    } catch (err) {
      setTrimError(api.extractErrorMessage(err));
    } finally {
      setTrimming(false);
    }
  }

  async function handleAnalyze() {
    if (!commanderCard) return;
    setAnalyzing(true);
    setAnalysisError('');
    setAnalysis(null);
    try {
      const { data } = await api.getAIWeaknessAnalysis(deckId, selectedModel || undefined);
      setAnalysis(data);
    } catch (err) {
      setAnalysisError(api.extractErrorMessage(err));
    } finally {
      setAnalyzing(false);
    }
  }

  function handleRemove(cardName: string) {
    if (!cardNameToId || !onRemoveCard) return;
    const cardId = cardNameToId.get(cardName.toLowerCase());
    if (cardId) {
      onRemoveCard(cardId);
      setRemovedCards((prev) => new Set(prev).add(cardName.toLowerCase()));
    }
  }

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
          <div className={styles.modeTabs}>
              <button
                className={`${styles.modeTab} ${aiMode === 'suggest' ? styles.modeTabActive : ''}`}
                onClick={() => setAiMode('suggest')}
              >✨ Suggerisci</button>
              <button
                className={`${styles.modeTab} ${styles.modeTabAnalyze} ${aiMode === 'analyze' ? styles.modeTabActive : ''}`}
                onClick={() => setAiMode('analyze')}
              >🔍 Analisi</button>
              {totalCards > 100 && (
                <button
                  className={`${styles.modeTab} ${styles.modeTabTrim} ${aiMode === 'trim' ? styles.modeTabActive : ''}`}
                  onClick={() => setAiMode('trim')}
                >✂️ Taglia ({totalCards - 100})</button>
              )}
            </div>
        </div>
        <div className={styles.headerBottom}>
          <div className={styles.modelSelector}>
            <label className={styles.modelLabel}>Modello</label>
            <select
              className={styles.modelSelect}
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={generating || trimming || analyzing}
            >
              {status.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          {aiMode === 'suggest' && (
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
          )}
          {aiMode === 'analyze' && (
            <button
              className={styles.btnAnalyze}
              onClick={handleAnalyze}
              disabled={analyzing || !commanderCard}
              title={!commanderCard ? 'Seleziona prima un commander' : ''}
            >
              {analyzing ? (
                <span className={styles.generating}>
                  <span className={styles.spinner} />
                  Analisi in corso…
                </span>
              ) : '🔍 Analizza debolezze'}
            </button>
          )}
          {aiMode === 'trim' && (
            <button
              className={styles.btnTrim}
              onClick={handleTrim}
              disabled={trimming}
            >
              {trimming ? (
                <span className={styles.generating}>
                  <span className={styles.spinner} />
                  Analisi in corso…
                </span>
              ) : `✂️ Analizza e suggerisci tagli`}
            </button>
          )}
        </div>
      </div>

      {!commanderCard && aiMode === 'suggest' && (
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

      {/* ANALYZE MODE */}
      {aiMode === 'analyze' && analyzing && (
        <div className={styles.thinkingBox}>
          <p>🔍 Analisi struttura del mazzo di <strong>{commanderCard?.name}</strong>…</p>
          <p className={styles.thinkingHint}>
            {status.provider === 'groq' ? 'Risposta in ~15 secondi con Groq.' : 'Ci vogliono 60–120 secondi la prima volta.'}
          </p>
        </div>
      )}

      {aiMode === 'analyze' && analysisError && <div className={styles.error}>{analysisError}</div>}

      {aiMode === 'analyze' && analysis && (
        <div className={styles.results}>
          <div className={styles.overviewBox}>
            <div className={styles.analyzeHeader}>
              <h4 className={styles.overviewTitle}>📋 Analisi del mazzo</h4>
              <span className={`${styles.bracketBadge} ${styles[`bracket${analysis.bracket}`]}`}>
                Bracket {analysis.bracket}
              </span>
            </div>
            <p className={styles.overview}>{analysis.overallAssessment}</p>
          </div>

          {analysis.winConditions.length > 0 && (
            <div className={styles.suggestionsSection}>
              <h4 className={styles.sectionTitle}>🏆 Win Condition ({analysis.winConditions.length})</h4>
              <ul className={styles.analyzeList}>
                {analysis.winConditions.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {analysis.strengths.length > 0 && (
            <div className={styles.suggestionsSection}>
              <h4 className={styles.sectionTitle}>✅ Punti di forza ({analysis.strengths.length})</h4>
              <ul className={styles.analyzeList}>
                {analysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {analysis.weaknesses.length > 0 && (
            <div className={styles.suggestionsSection}>
              <h4 className={styles.sectionTitle}>⚠️ Debolezze ({analysis.weaknesses.length})</h4>
              <div className={styles.weaknessList}>
                {analysis.weaknesses.map((w, i) => (
                  <div key={i} className={`${styles.weaknessCard} ${styles[`severity_${w.severity}`]}`}>
                    <div className={styles.weaknessHeader}>
                      <span className={styles.weaknessCategory}>{w.category}</span>
                      <span className={`${styles.severityBadge} ${styles[`severity_${w.severity}`]}`}>
                        {w.severity === 'high' ? '🔴 Alta' : w.severity === 'medium' ? '🟡 Media' : '🟢 Bassa'}
                      </span>
                    </div>
                    <p className={styles.weaknessDesc}>{w.description}</p>
                    {w.suggestions.length > 0 && (
                      <div className={styles.weaknessSuggestions}>
                        <span className={styles.suggestLabel}>Considera:</span>
                        {w.suggestions.map((s, j) => (
                          <span key={j} className={styles.suggestCard}>{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TRIM MODE */}
      {aiMode === 'trim' && trimming && (
        <div className={styles.thinkingBox}>
          <p>🧠 Analisi di <strong>{totalCards}</strong> carte — suggerendo <strong>{totalCards - 100}</strong> tagli…</p>
          <p className={styles.thinkingHint}>
            {status.provider === 'groq' ? 'Risposta in ~15 secondi con Groq.' : 'Ci vogliono 60–180 secondi la prima volta.'}
          </p>
        </div>
      )}

      {aiMode === 'trim' && trimError && <div className={styles.error}>{trimError}</div>}

      {aiMode === 'trim' && trimResult && (
        <div className={styles.results}>
          <div className={styles.overviewBox}>
            <h4 className={styles.overviewTitle}>✂️ Analisi tagli — {trimResult.cutCount} carte da rimuovere</h4>
            <p className={styles.overview}>{trimResult.analysis}</p>
          </div>
          <div className={styles.suggestionsSection}>
            <h4 className={styles.sectionTitle}>🗑 Carte da rimuovere ({trimResult.cuts.length})</h4>
            <div className={styles.suggestionList}>
              {trimResult.cuts.map((cut, i) => {
                const isRemoved = removedCards.has(cut.name.toLowerCase());
                const hasRemoveHandler = !!cardNameToId?.has(cut.name.toLowerCase());
                return (
                  <div key={i} className={`${styles.suggestionCard} ${isRemoved ? styles.added : ''}`}>
                    <div className={styles.suggestionContent}>
                      <div className={styles.suggestionHeader}>
                        <span className={styles.cardName}>{cut.name}</span>
                      </div>
                      <p className={styles.reason}>{cut.reason}</p>
                    </div>
                    <button
                      className={`${styles.btnAdd} ${styles.btnRemove} ${isRemoved ? styles.btnAdded : ''}`}
                      onClick={() => handleRemove(cut.name)}
                      disabled={isRemoved || !hasRemoveHandler}
                      title={isRemoved ? 'Rimossa' : !hasRemoveHandler ? 'Carta non trovata nel mazzo' : 'Rimuovi dal mazzo'}
                    >
                      {isRemoved ? '✓' : '🗑'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUGGEST MODE */}
      {aiMode === 'suggest' && suggestions && (
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
                        <div className={styles.badges}>
                          {(s.categories ?? []).map((cat: string) => (
                            <span
                              key={cat}
                              className={styles.category}
                              style={{ background: CATEGORY_COLORS[cat] ?? '#6b7280' }}
                            >
                              {cat}
                            </span>
                          ))}
                          <span
                            className={`${styles.bracketBadge} ${styles[`bracket${s.bracket ?? 2}`]}`}
                            title={`Bracket ${s.bracket ?? 2}`}
                          >
                            B{s.bracket ?? 2}
                          </span>
                          {s.isGameChanger && (
                            <span className={styles.gameChangerBadge} title="Game Changer — carta ad alto impatto">
                              ⚡ Game Changer
                            </span>
                          )}
                          {s.isMassLandDenial && (
                            <span className={styles.landDenialBadge} title="Mass Land Denial — rimozione massiva di terre">
                              🌍 Land Denial
                            </span>
                          )}
                        </div>
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

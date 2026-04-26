import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDeckStore } from '../store/deckStore';
import { CardSearch } from '../components/Search/CardSearch';
import { CommanderSearch } from '../components/Search/CommanderSearch';
import { DeckCardList } from '../components/Deck/DeckCardList';
import { DeckStatsPanel } from '../components/Deck/DeckStatsPanel';
import { AIAssistant } from '../components/AI/AIAssistant';
import { ImportModal } from '../components/Import/ImportModal';
import type { Card, DeckStats, ValidationResult } from 'shared';
import * as api from '../api';
import styles from './DeckBuilder.module.css';

type Tab = 'search' | 'commander' | 'ai';
type ExportFormat = 'txt' | 'mtgo' | 'moxfield';

export default function DeckBuilder() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { currentDeck, fetchDeck, createDeck, addCard, removeCard, clearCurrentDeck } =
    useDeckStore();

  // Stato per la creazione di un nuovo mazzo
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedCommander, setSelectedCommander] = useState<Card | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Stats
  const [stats, setStats] = useState<DeckStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // Cache locale delle carte per visualizzarle nella lista
  const [cardCache, setCardCache] = useState<Map<string, Card>>(new Map());

  // Tab attivo nel pannello sinistro
  const [tab, setTab] = useState<Tab>('search');

  // Export
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const isNew = !id;

  // Chiude il menu export se si clicca fuori
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    if (showExportMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu]);

  async function handleExport(format: ExportFormat) {
    if (!currentDeck) return;
    setExporting(true);
    setShowExportMenu(false);
    try {
      const response = await fetch(`/api/decks/${currentDeck.id}/export?format=${format}`);
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentDeck.name.replace(/\s+/g, '_')}-${format}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export fallito:', err);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (id) {
      fetchDeck(id);
    }
    return () => clearCurrentDeck();
  }, [id, fetchDeck, clearCurrentDeck]);

  // Carica le carte in cache quando il mazzo cambia
  useEffect(() => {
    if (!currentDeck) return;
    const missing = currentDeck.cards.filter((r) => !cardCache.has(r.card_id));
    if (missing.length === 0) return;

    Promise.all(
      missing.map((r) =>
        api.getCard(r.card_id).then(({ data }) => {
          setCardCache((prev) => new Map(prev).set(r.card_id, data));
        }).catch(() => null)
      )
    );
  }, [currentDeck]);

  // Ricarica stats e validazione ogni volta che il mazzo cambia
  useEffect(() => {
    if (!currentDeck?.id) { setStats(null); setValidation(null); return; }
    setStatsLoading(true);
    Promise.all([
      api.getDeckStats(currentDeck.id).then(({ data }) => setStats(data)).catch(() => setStats(null)),
      api.validateDeck(currentDeck.id).then(({ data }) => setValidation(data)).catch(() => setValidation(null)),
    ]).finally(() => setStatsLoading(false));
  }, [currentDeck]);

  // Crea il mazzo e il redirect
  async function handleCreate() {
    if (!newName.trim() || !selectedCommander) {
      setCreateError('Nome mazzo e commander sono obbligatori.');
      return;
    }
    setCreating(true);
    setCreateError('');
    const deck = await createDeck(newName.trim(), newDesc.trim(), selectedCommander.id);
    setCreating(false);
    if (deck) {
      navigate(`/decks/${deck.id}`, { replace: true });
    }
  }

  const handleAddCard = useCallback(
    async (card: Card) => {
      if (!currentDeck) return;
      // Aggiorna la cache locale immediatamente
      setCardCache((prev) => new Map(prev).set(card.id, card));
      await addCard(currentDeck.id, card.id);
    },
    [currentDeck, addCard]
  );

  const handleRemoveCard = useCallback(
    async (cardId: string) => {
      if (!currentDeck) return;
      await removeCard(currentDeck.id, cardId);
    },
    [currentDeck, removeCard]
  );

  const deckCardIds = new Set(currentDeck?.cards.map((r) => r.card_id) ?? []);
  const totalCards = currentDeck?.cards.reduce((s, r) => s + r.quantity, 0) ?? 0;
  const cardNameToId = new Map(
    Array.from(cardCache.entries()).map(([id, card]) => [card.name.toLowerCase(), id])
  );

  // ─── UI per creazione nuovo mazzo ─────────────────────────────────────────

  if (isNew) {
    return (
      <div className={styles.newDeckPage}>
        <Link to="/decks" className={styles.back}>← I miei mazzi</Link>
        <h1 className={styles.newTitle}>Nuovo mazzo Commander</h1>

        <div className={styles.newForm}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Nome mazzo *</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Es. Ur-Dragon Power"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Descrizione</label>
            <textarea
              className={styles.textarea}
              placeholder="Descrizione opzionale…"
              rows={2}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Commander *</label>
            <CommanderSearch
              onSelect={(card) => setSelectedCommander(card)}
              selected={selectedCommander}
            />
          </div>

          {createError && <p className={styles.error}>{createError}</p>}

          <button
            className={styles.btnCreate}
            onClick={handleCreate}
            disabled={creating || !newName.trim() || !selectedCommander}
          >
            {creating ? 'Creazione…' : 'Crea mazzo'}
          </button>
        </div>
      </div>
    );
  }

  // ─── UI builder mazzo esistente ────────────────────────────────────────────

  return (
    <div className={styles.builder}>
      {/* Barra superiore */}
      <header className={styles.builderHeader}>
        <Link to="/decks" className={styles.back}>← Mazzi</Link>
        <h1 className={styles.builderTitle}>{currentDeck?.name ?? 'Caricamento…'}</h1>
        <div className={styles.headerRight}>
          <span className={styles.cardCount}>{totalCards} / 100</span>
          <button
            className={styles.btnImport}
            onClick={() => setShowImportModal(true)}
            disabled={!currentDeck}
            title="Importa carte da file"
          >
            📥 Importa
          </button>
          <div className={styles.exportWrapper} ref={exportMenuRef}>
            <button
              className={styles.btnExport}
              onClick={() => setShowExportMenu((v) => !v)}
              disabled={exporting || !currentDeck}
              title="Esporta mazzo"
            >
              {exporting ? 'Esportando…' : '↓ Esporta'}
            </button>
            {showExportMenu && (
              <div className={styles.exportMenu}>
                <button onClick={() => handleExport('txt')}>TXT (leggibile)</button>
                <button onClick={() => handleExport('mtgo')}>MTGO</button>
                <button onClick={() => handleExport('moxfield')}>Moxfield</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={styles.layout}>
        {/* Pannello sinistro — ricerca */}
        <aside className={styles.searchPanel}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${tab === 'search' ? styles.activeTab : ''}`}
              onClick={() => setTab('search')}
            >
              Cerca carte
            </button>
            <button
              className={`${styles.tab} ${tab === 'commander' ? styles.activeTab : ''}`}
              onClick={() => setTab('commander')}
            >
              Commander
            </button>
            <button
              className={`${styles.tab} ${tab === 'ai' ? styles.activeTab : ''}`}
              onClick={() => setTab('ai')}
            >
              ✨ AI
            </button>
          </div>

          <div className={styles.tabContent}>
            {tab === 'search' && (
              <CardSearch onAddCard={handleAddCard} deckCardIds={deckCardIds} />
            )}
            {tab === 'ai' && currentDeck && (
            <AIAssistant
                deckId={currentDeck.id}
                commanderCard={cardCache.get(currentDeck.commander_id) ?? null}
                deckCardIds={deckCardIds}
                onAddCard={handleAddCard}
                totalCards={totalCards}
                cardNameToId={cardNameToId}
                onRemoveCard={handleRemoveCard}
              />
            )}
            {tab === 'commander' && currentDeck && (
              <div className={styles.commanderInfo}>
                <p className={styles.commanderLabel}>Commander attuale</p>
                {cardCache.get(currentDeck.commander_id) ? (
                  <div className={styles.commanderCard}>
                    {cardCache.get(currentDeck.commander_id)?.image_uris?.normal && (
                      <img
                        className={styles.commanderImg}
                        src={cardCache.get(currentDeck.commander_id)!.image_uris!.normal}
                        alt={cardCache.get(currentDeck.commander_id)!.name}
                      />
                    )}
                    <p className={styles.commanderName}>
                      {cardCache.get(currentDeck.commander_id)!.name}
                    </p>
                    <p className={styles.commanderType}>
                      {cardCache.get(currentDeck.commander_id)!.type_line}
                    </p>
                  </div>
                ) : (
                  <p className={styles.loading}>Caricamento…</p>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Pannello centrale — lista mazzo */}
        <section className={styles.deckPanel}>
          <h2 className={styles.panelTitle}>Mazzo</h2>
          {currentDeck && (
            <DeckCardList
              cards={currentDeck.cards}
              cardCache={cardCache}
              commanderId={currentDeck.commander_id}
              onRemove={handleRemoveCard}
              totalCount={totalCards}
            />
          )}
        </section>

        {/* Pannello destro — statistiche */}
        <aside className={styles.statsPanel}>
          <h2 className={styles.panelTitle}>Statistiche</h2>
          <DeckStatsPanel stats={stats} loading={statsLoading} validation={validation} />
        </aside>
      </div>

      {showImportModal && currentDeck && (
        <ImportModal
          deckId={currentDeck.id}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            fetchDeck(currentDeck.id);
          }}
        />
      )}
    </div>
  );
}


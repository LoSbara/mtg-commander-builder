import { Router } from 'express';
import { getDb } from '../models/db';
import { getCardById } from '../services/scryfallService';
import { getDeckCardRows, hydrateCards } from '../services/deckService';
import {
  getDeckSuggestions,
  isOllamaAvailable,
  getAvailableModels,
} from '../services/ollamaService';
import { searchCards } from '../services/scryfallService';

const router = Router();

// GET /api/ai/status  — verifica disponibilità Ollama e modelli installati
router.get('/status', async (_req, res) => {
  const available = await isOllamaAvailable();
  const models = available ? await getAvailableModels() : [];
  return res.json({ available, models });
});

// POST /api/ai/decks/:id/suggest  — genera suggerimenti AI per il mazzo
router.post('/decks/:id/suggest', async (req, res) => {
  const db = getDb();
  const deck = db
    .prepare('SELECT id, name, commander_id FROM decks WHERE id = ?')
    .get(req.params.id) as { id: string; name: string; commander_id: string } | undefined;

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  const { model } = req.body as { model?: string };

  // Verifica Ollama
  const available = await isOllamaAvailable();
  if (!available) {
    return res.status(503).json({
      message: 'OLLAMA_NOT_RUNNING',
      detail: 'Ollama non è in esecuzione. Avvia il servizio con: ollama serve',
    });
  }

  try {
    // Carica commander e carte attuali del mazzo
    const commander = await getCardById(deck.commander_id);
    const rows = getDeckCardRows(deck.id);
    const cardMap = await hydrateCards(rows);
    const currentCards = Array.from(cardMap.values());

    // Genera suggerimenti via LLM
    const suggestions = await getDeckSuggestions(commander, currentCards, model);

    // Risolve i nomi delle carte su Scryfall per ottenere gli id reali
    // (solo le prime 15 per non eccedere il rate limit)
    const resolved = await Promise.allSettled(
      suggestions.suggestions.slice(0, 15).map(async (s) => {
        try {
          const result = await searchCards(`!"${s.name}"`, 1);
          const card = result.data[0] ?? null;
          return { ...s, card };
        } catch {
          return { ...s, card: null };
        }
      })
    );

    const resolvedSuggestions = resolved
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<typeof resolved[number] extends PromiseFulfilledResult<infer T> ? T : never>).value);

    return res.json({
      ...suggestions,
      suggestions: resolvedSuggestions,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Errore AI suggest:', msg);

    if (msg.startsWith('OLLAMA_NOT_RUNNING') || msg.startsWith('MODEL_NOT_FOUND')) {
      return res.status(503).json({ message: msg });
    }

    return res.status(500).json({ message: 'Errore durante la generazione dei suggerimenti AI.' });
  }
});

export default router;

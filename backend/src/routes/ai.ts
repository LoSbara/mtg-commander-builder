import { Router } from 'express';
import { getDb } from '../models/db';
import { getCardById } from '../services/scryfallService';
import { getDeckCardRows, hydrateCards } from '../services/deckService';
import {
  isAIAvailable,
  getAvailableModels,
  getDeckSuggestions,
  getActiveProvider,
} from '../services/aiService';
import { searchCards } from '../services/scryfallService';

const router = Router();

// GET /api/ai/status  — verifica disponibilità AI e provider attivo
router.get('/status', async (_req, res) => {
  const provider = getActiveProvider();
  const available = await isAIAvailable();
  const models = available ? await getAvailableModels() : [];
  return res.json({ available, models, provider });
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

  // Verifica disponibilità AI (Groq o Ollama)
  const available = await isAIAvailable();
  if (!available) {
    const provider = getActiveProvider();
    return res.status(503).json({
      message: provider === 'groq' ? 'GROQ_NOT_CONFIGURED' : 'OLLAMA_NOT_RUNNING',
      detail: provider === 'groq'
        ? 'GROQ_API_KEY non impostata. Aggiungila nel file .env'
        : 'Ollama non è in esecuzione. Avvia il servizio con: ollama serve',
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

    // Risolve i nomi delle carte su Scryfall in modo sequenziale (rispetta rate limit)
    // e filtra le carte illegali per color identity
    const commanderColors = commander.color_identity;
    const resolvedSuggestions: { name: string; reason: string; category: string; card: unknown }[] = [];

    for (const s of suggestions.suggestions.slice(0, 20)) {
      if (resolvedSuggestions.length >= 15) break;
      try {
        const result = await searchCards(`!"${s.name}"`, 1);
        const card = result.data[0] ?? null;

        // Filtra carta illegale per color identity (safety net server-side)
        if (card) {
          const cardColors: string[] = [...((card as { color_identity?: string[] }).color_identity ?? [])];
          const isLegal = cardColors.every((c) => (commanderColors as string[]).includes(c));
          if (!isLegal) {
            console.warn(`AI suggerito carta illegale filtrata: ${card.name} (${cardColors.join('')}) fuori da {${commanderColors.join('')}}`);
            continue;
          }
        }

        resolvedSuggestions.push({ ...s, card });
      } catch {
        resolvedSuggestions.push({ ...s, card: null });
      }
    }

    return res.json({
      ...suggestions,
      suggestions: resolvedSuggestions,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Errore AI suggest:', msg);

    if (msg.startsWith('OLLAMA_NOT_RUNNING') || msg.startsWith('MODEL_NOT_FOUND') ||
        msg.startsWith('GROQ_INVALID_KEY') || msg.startsWith('GROQ_RATE_LIMIT') ||
        msg.startsWith('GROQ_NOT_CONFIGURED')) {
      return res.status(503).json({ message: msg });
    }

    return res.status(500).json({ message: 'Errore durante la generazione dei suggerimenti AI.' });
  }
});

export default router;
